package handlers

import (
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"cif-backend/internal/httpx"
	"cif-backend/internal/models"
	"cif-backend/internal/repository"
)

const (
	maxUploadSize    = 20 << 20
	applicationIDKey = "application_id"
)

var allowedFileTypes = map[string]bool{"jpg": true, "jpeg": true, "png": true, "pdf": true}
var allowedDocTypes = map[string]bool{"KTP": true, "NPWP": true, "SLIP_GAJI": true, "BUKU_NIKAH": true, "LAINNYA": true}

type UploadHandler struct {
	documents *repository.DocumentRepository
	customers *repository.CustomerRepository
	dir       string
}

func NewUploadHandler(documents *repository.DocumentRepository, customers *repository.CustomerRepository, dir string) *UploadHandler {
	return &UploadHandler{documents: documents, customers: customers, dir: dir}
}

// Create handles POST /api/uploads (multipart: file, doc_type, optional application_id).
func (h *UploadHandler) Create(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadSize+(1<<20))

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		httpx.Fail(c, http.StatusBadRequest, "File wajib diunggah pada field 'file'.", nil)
		return
	}
	defer file.Close()
	if header.Size <= 0 || header.Size > maxUploadSize {
		httpx.Fail(c, http.StatusRequestEntityTooLarge, "Ukuran file maksimal 20MB.", nil)
		return
	}

	fileType := strings.ToLower(strings.TrimPrefix(filepath.Ext(header.Filename), "."))
	if !allowedFileTypes[fileType] {
		httpx.Fail(c, http.StatusBadRequest, "Tipe file harus JPG, JPEG, PNG, atau PDF.", nil)
		return
	}
	docType := c.PostForm("doc_type")
	if !allowedDocTypes[docType] {
		httpx.Fail(c, http.StatusBadRequest, "Jenis dokumen harus KTP, NPWP, SLIP_GAJI, BUKU_NIKAH, atau LAINNYA.", nil)
		return
	}

	applicationID := c.GetString(applicationIDKey)

	id, err := newID()
	if err != nil {
		slog.Error("generate upload id failed", "error", err)
		httpx.Fail(c, http.StatusInternalServerError, "Terjadi kesalahan internal.", nil)
		return
	}
	if err := os.MkdirAll(h.dir, 0o755); err != nil {
		slog.Error("create upload dir failed", "error", err)
		httpx.Fail(c, http.StatusInternalServerError, "Terjadi kesalahan internal.", nil)
		return
	}

	path := filepath.Join(h.dir, id+"."+fileType)
	target, err := os.Create(path)
	if err != nil {
		slog.Error("create upload file failed", "error", err)
		httpx.Fail(c, http.StatusInternalServerError, "Terjadi kesalahan internal.", nil)
		return
	}
	written, copyErr := io.Copy(target, io.LimitReader(file, maxUploadSize+1))
	closeErr := target.Close()
	if copyErr != nil || closeErr != nil || written > maxUploadSize {
		os.Remove(path)
		httpx.Fail(c, http.StatusInternalServerError, "Gagal menyimpan file.", nil)
		return
	}

	document := &models.Document{
		ID:       id,
		FileName: filepath.Base(header.Filename),
		DocType:  docType,
		FileType: fileType,
		Size:     int(written),
	}
	if applicationID != "" {
		document.ApplicationID = &applicationID
	}
	if err := h.documents.Create(c.Request.Context(), document); err != nil {
		os.Remove(path)
		slog.Error("save document failed", "error", err)
		httpx.Fail(c, http.StatusInternalServerError, "Terjadi kesalahan internal.", nil)
		return
	}

	httpx.OK(c, http.StatusCreated, "File berhasil diunggah.", gin.H{
		"upload_id":      document.ID,
		"application_id": document.ApplicationID,
		"file_name":      document.FileName,
		"doc_type":       document.DocType,
		"file_type":      document.FileType,
		"size":           document.Size,
		"url":            "/api/uploads/" + document.ID,
		"created_at":     document.CreatedAt,
	})
}

// RequireApplicationHeader rejects requests without a valid X-Application-Id header.
func (h *UploadHandler) RequireApplicationHeader(c *gin.Context) {
	applicationID := strings.TrimSpace(c.GetHeader("X-Application-Id"))
	if applicationID == "" {
		httpx.Fail(c, http.StatusUnauthorized, "Header X-Application-Id wajib diisi.", nil)
		c.Abort()
		return
	}
	exists, err := h.customers.Exists(c.Request.Context(), applicationID)
	if err != nil {
		slog.Error("check application failed", "error", err)
		httpx.Fail(c, http.StatusInternalServerError, "Terjadi kesalahan internal.", nil)
		c.Abort()
		return
	}
	if !exists {
		httpx.Fail(c, http.StatusNotFound, "Pengajuan tidak ditemukan.", nil)
		c.Abort()
		return
	}
	c.Set(applicationIDKey, applicationID)
	c.Next()
}

// Get handles GET /api/uploads/:upload_id and serves the file inline.
func (h *UploadHandler) Get(c *gin.Context) {
	document, err := h.documents.FindByID(c.Request.Context(), c.Param("upload_id"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.Fail(c, http.StatusNotFound, "File tidak ditemukan.", nil)
			return
		}
		slog.Error("get document failed", "error", err)
		httpx.Fail(c, http.StatusInternalServerError, "Terjadi kesalahan internal.", nil)
		return
	}

	if document.ApplicationID == nil || *document.ApplicationID != c.GetString(applicationIDKey) {
		httpx.Fail(c, http.StatusNotFound, "File tidak ditemukan.", nil)
		return
	}

	path := filepath.Join(h.dir, document.ID+"."+document.FileType)
	if _, err := os.Stat(path); err != nil {
		httpx.Fail(c, http.StatusNotFound, "File tidak ditemukan.", nil)
		return
	}
	contentType := mime.TypeByExtension("." + document.FileType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Header("Content-Type", contentType)
	c.Header("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": document.FileName}))
	c.File(path)
}

// safeFileName keeps only the base name and drops control characters.
func safeFileName(name string) string {
	base := filepath.Base(name)
	return strings.Map(func(r rune) rune {
		if r < 32 || r == 127 || r == '"' {
			return -1
		}
		return r
	}, base)
}

func newID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x", raw[0:4], raw[4:6], raw[6:8], raw[8:10], raw[10:16]), nil
}
