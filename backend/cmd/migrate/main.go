// Command migrate runs golang-migrate against backend/migrations using the
// connection settings from backend/.env.
//
//	go run ./cmd/migrate up
//	go run ./cmd/migrate down 1
//	go run ./cmd/migrate version
//	go run ./cmd/migrate force 1
package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	"cif-backend/internal/config"
)

func main() {
	envPath := flag.String("env", ".env", "path to env file")
	dir := flag.String("dir", "migrations", "migrations directory")
	flag.Parse()

	command := flag.Arg(0)
	if command == "" {
		usage()
	}

	cfg, err := config.Load(*envPath)
	if err != nil {
		fail(err)
	}
	if driver := cfg.Get("DB_DRIVER", "postgres"); driver != "postgres" {
		fail(fmt.Errorf("unsupported DB_DRIVER %q", driver))
	}

	// golang-migrate registers its pgx v5 driver as "pgx5".
	databaseURL := strings.Replace(cfg.PostgresURL(), "postgres://", "pgx5://", 1)

	m, err := migrate.New("file://"+*dir, databaseURL)
	if err != nil {
		fail(err)
	}
	defer func() {
		sourceErr, databaseErr := m.Close()
		if sourceErr != nil {
			fail(sourceErr)
		}
		if databaseErr != nil {
			fail(databaseErr)
		}
	}()

	switch command {
	case "up":
		err = m.Up()
	case "down":
		steps := 1
		if arg := flag.Arg(1); arg != "" {
			steps, err = strconv.Atoi(arg)
			if err != nil || steps < 1 {
				fail(fmt.Errorf("down steps must be a positive integer, got %q", arg))
			}
		}
		err = m.Steps(-steps)
	case "version":
		version, dirty, versionErr := m.Version()
		if errors.Is(versionErr, migrate.ErrNilVersion) {
			fmt.Println("version=none dirty=false")
			return
		}
		if versionErr != nil {
			fail(versionErr)
		}
		fmt.Printf("version=%d dirty=%t\n", version, dirty)
		return
	case "force":
		arg := flag.Arg(1)
		version, convErr := strconv.Atoi(arg)
		if convErr != nil {
			fail(fmt.Errorf("force needs a version number, got %q", arg))
		}
		err = m.Force(version)
	default:
		usage()
	}

	if err != nil {
		if errors.Is(err, migrate.ErrNoChange) {
			fmt.Println("no change")
			return
		}
		fail(err)
	}
	version, dirty, versionErr := m.Version()
	switch {
	case versionErr == nil:
		fmt.Printf("%s ok, version=%d dirty=%t\n", command, version, dirty)
	case errors.Is(versionErr, migrate.ErrNilVersion):
		fmt.Printf("%s ok, version=none\n", command)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: migrate [-env file] [-dir dir] {up|down [steps]|version|force <version>}")
	os.Exit(2)
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "migrate:", err)
	os.Exit(1)
}
