// Package models maps the Postgres tables in migrations/.
package models

import "time"

// Customer is a CIF application. NIK is only used for matching, so it is not stored.
type Customer struct {
	ID                 string     `gorm:"column:id;type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	ApplicationID      *string    `gorm:"column:application_id" json:"application_id,omitempty"`
	FullName           string     `gorm:"column:full_name" json:"full_name"`
	NIK                *string    `gorm:"column:nik" json:"nik,omitempty"`
	DOB                time.Time  `gorm:"column:dob;type:date" json:"dob"`
	Phone              *string    `gorm:"column:phone" json:"phone,omitempty"`
	MaritalStatus      string     `gorm:"column:marital_status" json:"marital_status"`
	SpouseForgotten    bool       `gorm:"column:spouse_forgotten" json:"spouse_forgotten"`
	SpouseName         *string    `gorm:"column:spouse_name" json:"spouse_name,omitempty"`
	LoanType           string     `gorm:"column:loan_type" json:"loan_type"`
	LoanAmount         int64      `gorm:"column:loan_amount" json:"loan_amount"`
	LoanTenorMonths    int        `gorm:"column:loan_tenor_months" json:"loan_tenor_months"`
	Decision           *string    `gorm:"column:decision" json:"decision,omitempty"`
	Reason             *string    `gorm:"column:reason" json:"reason,omitempty"`
	IdentityConfidence *float64   `gorm:"column:identity_confidence" json:"identity_confidence,omitempty"`
	CreditScore        *float64   `gorm:"column:credit_score" json:"credit_score,omitempty"`
	MatchedNoCIF       *string    `gorm:"column:matched_no_cif" json:"matched_no_cif,omitempty"`
	Status             *string    `gorm:"column:status" json:"status,omitempty"`
	CreatedAt          time.Time  `gorm:"column:created_at" json:"created_at"`
	UpdatedAt          time.Time  `gorm:"column:updated_at" json:"updated_at"`
	Documents          []Document `gorm:"foreignKey:ApplicationID;references:ApplicationID" json:"documents"`
}

func (Customer) TableName() string { return "customer" }

// Document is an uploaded file linked to an application.
type Document struct {
	ID            string    `gorm:"column:id;type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	ApplicationID *string   `gorm:"column:application_id" json:"application_id,omitempty"`
	FileName      string    `gorm:"column:file_name" json:"file_name"`
	DocType       string    `gorm:"column:doc_type" json:"doc_type"`
	FileType      string    `gorm:"column:file_type" json:"file_type"`
	Size          int       `gorm:"column:size" json:"size"`
	CreatedAt     time.Time `gorm:"column:created_at" json:"created_at"`
}

func (Document) TableName() string { return "documents" }
