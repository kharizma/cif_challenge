package handlers_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"cif-backend/internal/config"
	"cif-backend/internal/handlers"
	"cif-backend/internal/models"
	"cif-backend/internal/repository"
)

// TestUploadFlowIntegration checks the real upload flow end to end: multipart
// POST stores the file on disk and a row in Postgres, GET serves the same bytes,
// and the X-Application-Id guard blocks missing or foreign application ids.
//
// It needs a reachable Postgres with CREATE DATABASE rights, configured with the
// usual DB_* variables. Without one the test skips, so `go test ./...` still
// passes on a machine with no database.
func TestUploadFlowIntegration(t *testing.T) {
	db := newTestDB(t)
	appID := seedCustomer(t, db)
	dir := t.TempDir()
	router := newUploadRouter(db, dir)

	// 1x1 PNG so the stored file is a real image, not just bytes.
	var pngBytes bytes.Buffer
	if err := png.Encode(&pngBytes, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatalf("encode png: %v", err)
	}

	body, contentType := multipartBody(t, "ktp.png", pngBytes.Bytes())
	req := httptest.NewRequest(http.MethodPost, "/api/uploads", body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("X-Application-Id", appID)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("POST /api/uploads status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var created struct {
		Success bool `json:"success"`
		Data    struct {
			UploadID string `json:"upload_id"`
			Size     int    `json:"size"`
			URL      string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !created.Success || created.Data.UploadID == "" {
		t.Fatalf("unexpected create response: %s", rec.Body.String())
	}
	if created.Data.Size != pngBytes.Len() {
		t.Fatalf("reported size = %d, want %d", created.Data.Size, pngBytes.Len())
	}

	// File on disk matches the upload, named after the upload id.
	stored := filepath.Join(dir, created.Data.UploadID+".png")
	saved, err := os.ReadFile(stored)
	if err != nil {
		t.Fatalf("read stored upload %s: %v", stored, err)
	}
	if !bytes.Equal(saved, pngBytes.Bytes()) {
		t.Fatalf("stored bytes differ from uploaded bytes (%d vs %d)", len(saved), pngBytes.Len())
	}

	// Row exists and is linked to the application.
	var document models.Document
	if err := db.Where("id = ?", created.Data.UploadID).First(&document).Error; err != nil {
		t.Fatalf("document row missing: %v", err)
	}
	if document.ApplicationID == nil || *document.ApplicationID != appID {
		t.Fatalf("document application_id = %v, want %s", document.ApplicationID, appID)
	}
	if document.DocType != "KTP" || document.FileType != "png" || document.FileName != "ktp.png" {
		t.Fatalf("unexpected document row: %+v", document)
	}

	// GET with the owning application returns identical bytes.
	get := func(applicationHeader string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/api/uploads/"+created.Data.UploadID, nil)
		if applicationHeader != "" {
			req.Header.Set("X-Application-Id", applicationHeader)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}

	rec = get(appID)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET upload status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if !bytes.Equal(rec.Body.Bytes(), pngBytes.Bytes()) {
		t.Fatal("GET upload body differs from uploaded bytes")
	}
	if got := rec.Header().Get("Content-Type"); got != "image/png" {
		t.Fatalf("Content-Type = %q, want image/png", got)
	}

	// Missing header is rejected before touching the database.
	if rec := get(""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("GET without X-Application-Id status = %d, want 401", rec.Code)
	}
	// Another application must not read the file.
	if rec := get("APP-20990101-9999"); rec.Code != http.StatusNotFound {
		t.Fatalf("GET with foreign application status = %d, want 404", rec.Code)
	}

	// Unsupported type is rejected and leaves no file or row behind.
	body, contentType = multipartBody(t, "ktp.exe", []byte("MZ"))
	req = httptest.NewRequest(http.MethodPost, "/api/uploads", body)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("X-Application-Id", appID)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("POST unsupported type status = %d, want 400", rec.Code)
	}
	var count int64
	if err := db.Model(&models.Document{}).Count(&count).Error; err != nil {
		t.Fatalf("count documents: %v", err)
	}
	if count != 1 {
		t.Fatalf("documents row count = %d, want 1", count)
	}
}

// newUploadRouter mirrors the upload routes registered in cmd/api/main.go.
func newUploadRouter(db *gorm.DB, dir string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	upload := handlers.NewUploadHandler(
		repository.NewDocumentRepository(db),
		repository.NewCustomerRepository(db),
		dir,
	)

	router := gin.New()
	routes := router.Group("/api/uploads")
	routes.Use(upload.RequireApplicationHeader)
	routes.POST("", upload.Create)
	routes.GET("/:upload_id", upload.Get)
	return router
}

func multipartBody(t *testing.T, filename string, content []byte) (*bytes.Buffer, string) {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.WriteField("doc_type", "KTP"); err != nil {
		t.Fatalf("write doc_type: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	return body, writer.FormDataContentType()
}

func seedCustomer(t *testing.T, db *gorm.DB) string {
	t.Helper()
	applicationID := "APP-20260101-0001"
	customer := models.Customer{
		ApplicationID:   &applicationID,
		FullName:        "Budi Santoso",
		DOB:             time.Date(1990, 4, 15, 0, 0, 0, 0, time.UTC),
		MaritalStatus:   "KAWIN",
		LoanType:        "KPR",
		LoanAmount:      500000000,
		LoanTenorMonths: 60,
	}
	if err := db.Create(&customer).Error; err != nil {
		t.Fatalf("seed customer: %v", err)
	}
	return applicationID
}

// newTestDB creates a throwaway database, migrates it, and drops it on cleanup.
// DB_* env vars select the server; DB_NAME is only used to reach it.
func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	cfg := config.LoadOptional("")
	baseURL := cfg.PostgresURL()

	admin, err := gorm.Open(postgres.Open(baseURL), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		t.Skipf("integration test needs Postgres: %v", err)
	}
	if sqlDB, err := admin.DB(); err == nil {
		if err := sqlDB.Ping(); err != nil {
			t.Skipf("integration test needs Postgres: %v", err)
		}
	}

	name := fmt.Sprintf("cif_test_%d", time.Now().UnixNano())
	if err := admin.Exec("CREATE DATABASE " + name).Error; err != nil {
		t.Skipf("integration test needs CREATE DATABASE rights: %v", err)
	}
	// Registered before any later failure so a broken run still cleans up.
	t.Cleanup(func() {
		if err := admin.Exec("DROP DATABASE " + name + " WITH (FORCE)").Error; err != nil {
			t.Logf("drop test database %s: %v", name, err)
		}
	})

	dbURL := replaceDatabase(t, baseURL, name)
	migrationsDir := filepath.Join("..", "..", "migrations")
	absDir, err := filepath.Abs(migrationsDir)
	if err != nil {
		t.Fatalf("resolve migrations dir: %v", err)
	}
	// golang-migrate registers the pgx v5 driver as "pgx5"; GORM needs postgres://.
	m, err := migrate.New("file://"+absDir, "pgx5://"+strings.TrimPrefix(dbURL, "postgres://"))
	if err != nil {
		t.Fatalf("open migrations: %v", err)
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		t.Fatalf("run migrations: %v", err)
	}
	if sourceErr, databaseErr := m.Close(); sourceErr != nil || databaseErr != nil {
		// Close reports source and database errors separately; neither is fatal here.
		t.Logf("close migrations: source=%v database=%v", sourceErr, databaseErr)
	}

	db, err := gorm.Open(postgres.Open(dbURL), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		t.Fatalf("connect test database: %v", err)
	}
	// Runs before the drop above (cleanups are LIFO).
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

// replaceDatabase swaps the database name in a postgres:// URL.
func replaceDatabase(t *testing.T, raw, name string) string {
	t.Helper()
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("parse database url: %v", err)
	}
	parsed.Path = "/" + name
	host := parsed.Host
	if parsed.User != nil {
		host = parsed.User.String() + "@" + host
	}
	return "postgres://" + host + parsed.EscapedPath() + "?" + parsed.RawQuery
}
