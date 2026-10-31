package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"cif-backend/internal/httpx"
	"cif-backend/internal/models"
	"cif-backend/internal/services"
)

type CifHandler struct{ service *services.CifService }

func NewCifHandler(service *services.CifService) *CifHandler {
	return &CifHandler{service: service}
}

// List handles GET /api/cif?page=1&limit=10.
func (h *CifHandler) List(c *gin.Context) {
	page := queryInt(c, "page", 1)
	limit := queryInt(c, "limit", 10)
	if limit > 100 {
		limit = 100
	}

	customers, total, err := h.service.List(c.Request.Context(), page, limit)
	if err != nil {
		slog.Error("list applications failed", "error", err)
		httpx.Fail(c, http.StatusInternalServerError, "Terjadi kesalahan internal.", nil)
		return
	}

	totalPages := 0
	if total > 0 {
		totalPages = int((total + int64(limit) - 1) / int64(limit))
	}
	httpx.OK(c, http.StatusOK, "Daftar pengajuan ditemukan.", gin.H{
		"items": customers,
		"pagination": gin.H{
			"page":        page,
			"limit":       limit,
			"total":       total,
			"total_pages": totalPages,
		},
	})
}

// Check handles POST /api/cif/check.
func (h *CifHandler) Check(c *gin.Context) {
	var input services.CheckInput
	if err := c.ShouldBindJSON(&input); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "Body JSON tidak valid.", nil)
		return
	}

	customer, scoring, err := h.service.Check(c.Request.Context(), input)
	if err != nil {
		var validation *services.ValidationError
		switch {
		case errors.As(err, &validation):
			httpx.Fail(c, http.StatusBadRequest, "Data tidak valid.", validation.Fields)
		case errors.Is(err, services.ErrCustomerInfo):
			httpx.Fail(c, http.StatusServiceUnavailable, "Layanan customer information tidak dapat dihubungi. Coba lagi nanti.", nil)
		case errors.Is(err, services.ErrScoring):
			httpx.Fail(c, http.StatusBadGateway, "Layanan scoring tidak dapat dihubungi. Coba lagi nanti.", nil)
		default:
			slog.Error("check failed", "error", err)
			httpx.Fail(c, http.StatusInternalServerError, "Terjadi kesalahan internal.", nil)
		}
		return
	}

	customer.Documents = []models.Document{}
	data := gin.H{
		"application_id":      customer.ApplicationID,
		"status":              customer.Status,
		"decision":            customer.Decision,
		"reason":              customer.Reason,
		"identity_confidence": customer.IdentityConfidence,
		"credit_score":        customer.CreditScore,
		"matched_no_cif":      customer.MatchedNoCIF,
		"customer":            customer,
	}
	if scoring != nil {
		data["scoring"] = gin.H{
			"no_cif":       scoring.NoCIF,
			"score":        scoring.Score,
			"grade":        scoring.Grade,
			"reason_codes": scoring.ReasonCodes,
		}
	}
	httpx.OK(c, http.StatusCreated, "Pengajuan berhasil diproses.", data)
}

// queryInt reads a positive integer query value and falls back when absent or invalid.
func queryInt(c *gin.Context, key string, fallback int) int {
	value, err := strconv.Atoi(c.Query(key))
	if err != nil || value < 1 {
		return fallback
	}
	return value
}

// Get handles GET /api/cif/:application_id.
func (h *CifHandler) Get(c *gin.Context) {
	customer, err := h.service.Get(c.Request.Context(), c.Param("application_id"))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.Fail(c, http.StatusNotFound, "Pengajuan tidak ditemukan.", nil)
			return
		}
		slog.Error("get application failed", "error", err)
		httpx.Fail(c, http.StatusInternalServerError, "Terjadi kesalahan internal.", nil)
		return
	}
	if customer.Documents == nil {
		customer.Documents = []models.Document{}
	}
	httpx.OK(c, http.StatusOK, "Pengajuan ditemukan.", customer)
}
