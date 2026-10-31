// Command db is a thin Postgres client for this backend: it loads backend/.env,
// connects with pgx and runs a query, a SQL file, or a connectivity check.
//
//	go run ./cmd/db -ping
//	go run ./cmd/db -q "select count(*) from customer"
//	go run ./cmd/db -f migrations/000001_create_customer_documents.up.sql
package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"

	"cif-backend/internal/config"
)

func main() {
	envPath := flag.String("env", ".env", "path to env file")
	query := flag.String("q", "", "SQL query to run (rows are printed as TSV)")
	file := flag.String("f", "", "SQL file to execute")
	ping := flag.Bool("ping", false, "check connectivity and print server version")
	timeout := flag.Duration("timeout", 15*time.Second, "connect/query timeout")
	flag.Parse()

	if err := run(*envPath, *query, *file, *ping, *timeout); err != nil {
		fmt.Fprintln(os.Stderr, "db:", err)
		os.Exit(1)
	}
}

func run(envPath, query, file string, ping bool, timeout time.Duration) error {
	cfg, err := config.Load(envPath)
	if err != nil {
		return err
	}
	if driver := cfg.Get("DB_DRIVER", "postgres"); driver != "postgres" {
		return fmt.Errorf("unsupported DB_DRIVER %q", driver)
	}

	dsn := cfg.PostgresURL()
	connConfig, err := pgx.ParseConfig(dsn)
	if err != nil {
		return fmt.Errorf("parse dsn: %w", err)
	}
	// Simple protocol so a whole migration file can run in one Exec.
	connConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	db := stdlib.OpenDB(*connConfig)
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("connect to %s: %w", redact(dsn), err)
	}

	switch {
	case ping && query == "" && file == "":
		var version string
		if err := db.QueryRowContext(ctx, "select version()").Scan(&version); err != nil {
			return fmt.Errorf("select version: %w", err)
		}
		fmt.Println(version)
		return nil
	case file != "":
		script, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("read %s: %w", file, err)
		}
		return execScript(ctx, db, string(script))
	case query != "":
		return printQuery(ctx, db, query)
	default:
		return fmt.Errorf("nothing to do: pass -ping, -q or -f (see -h)")
	}
}

func execScript(ctx context.Context, db *sql.DB, script string) error {
	result, err := db.ExecContext(ctx, script)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err == nil {
		fmt.Printf("OK: %d row(s) affected\n", affected)
		return nil
	}
	fmt.Println("OK")
	return nil
}

func printQuery(ctx context.Context, db *sql.DB, query string) error {
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return err
	}
	fmt.Println(strings.Join(columns, "\t"))

	values := make([]any, len(columns))
	pointers := make([]any, len(columns))
	for i := range values {
		pointers[i] = &values[i]
	}

	count := 0
	for rows.Next() {
		if err := rows.Scan(pointers...); err != nil {
			return err
		}
		line := make([]string, len(columns))
		for i, value := range values {
			switch typed := value.(type) {
			case nil:
				line[i] = "NULL"
			case []byte:
				line[i] = string(typed)
			default:
				line[i] = fmt.Sprint(typed)
			}
		}
		fmt.Println(strings.Join(line, "\t"))
		count++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "(%d row(s))\n", count)
	return nil
}

func redact(dsn string) string {
	parsed, err := url.Parse(dsn)
	if err != nil || parsed.User == nil {
		return dsn
	}
	parsed.User = url.User(parsed.User.Username())
	return parsed.String()
}
