// Package repository holds the Postgres queries for customers and documents.
package repository

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"gorm.io/gorm"

	"cif-backend/internal/models"
)

type CustomerRepository struct{ db *gorm.DB }

func NewCustomerRepository(db *gorm.DB) *CustomerRepository { return &CustomerRepository{db: db} }

// NextApplicationID returns the next sequence for the given daily prefix (APP-YYYYMMDD-).
// Two concurrent requests can get the same value; Create rejects the duplicate and the
// service retries with the next number.
func (r *CustomerRepository) NextApplicationID(ctx context.Context, prefix string) (string, error) {
	var last *string
	if err := r.db.WithContext(ctx).Raw(
		"SELECT MAX(application_id) FROM customer WHERE application_id LIKE ?", prefix+"%",
	).Scan(&last).Error; err != nil {
		return "", err
	}
	sequence := 1
	if last != nil {
		if value, err := strconv.Atoi(strings.TrimPrefix(*last, prefix)); err == nil {
			sequence = value + 1
		}
	}
	return fmt.Sprintf("%s%04d", prefix, sequence), nil
}

func (r *CustomerRepository) Create(ctx context.Context, customer *models.Customer) error {
	return r.db.WithContext(ctx).Create(customer).Error
}

// List returns one page of applications, newest first, with the total row count.
func (r *CustomerRepository) List(ctx context.Context, page, limit int) ([]models.Customer, int64, error) {
	var total int64
	if err := r.db.WithContext(ctx).Model(&models.Customer{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var customers []models.Customer
	err := r.db.WithContext(ctx).
		Preload("Documents").
		Order("created_at DESC, id DESC").
		Offset((page - 1) * limit).
		Limit(limit).
		Find(&customers).Error
	if err != nil {
		return nil, 0, err
	}
	return customers, total, nil
}

func (r *CustomerRepository) FindByApplicationID(ctx context.Context, applicationID string) (*models.Customer, error) {
	var customer models.Customer
	err := r.db.WithContext(ctx).Preload("Documents").Where("application_id = ?", applicationID).First(&customer).Error
	if err != nil {
		return nil, err
	}
	return &customer, nil
}

func (r *CustomerRepository) Exists(ctx context.Context, applicationID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&models.Customer{}).Where("application_id = ?", applicationID).Count(&count).Error
	return count > 0, err
}

type DocumentRepository struct{ db *gorm.DB }

func NewDocumentRepository(db *gorm.DB) *DocumentRepository { return &DocumentRepository{db: db} }

func (r *DocumentRepository) Create(ctx context.Context, document *models.Document) error {
	return r.db.WithContext(ctx).Create(document).Error
}

func (r *DocumentRepository) FindByID(ctx context.Context, id string) (*models.Document, error) {
	var document models.Document
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&document).Error; err != nil {
		return nil, err
	}
	return &document, nil
}
