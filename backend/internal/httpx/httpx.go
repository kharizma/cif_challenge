// Package httpx holds the shared JSON envelope and request logging.
package httpx

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// OK writes a successful envelope.
func OK(c *gin.Context, status int, message string, data any) {
	c.JSON(status, gin.H{"success": true, "message": message, "data": data})
}

// Fail writes an error envelope. fields is omitted when nil.
func Fail(c *gin.Context, status int, message string, fields any) {
	body := gin.H{"success": false, "message": message}
	if fields != nil {
		body["errors"] = fields
	}
	c.JSON(status, body)
}

// LogRequests writes one line per request and logs server errors with the failure status.
func LogRequests() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		status := c.Writer.Status()
		attrs := []any{
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", status,
			"latency_ms", time.Since(start).Milliseconds(),
			"ip", c.ClientIP(),
		}
		if status >= http.StatusInternalServerError {
			attrs = append(attrs, "error", c.Errors.String())
			slog.Error("request failed", attrs...)
			return
		}
		slog.Info("request", attrs...)
	}
}
