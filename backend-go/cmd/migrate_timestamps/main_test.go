package main

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	_ "github.com/glebarez/sqlite"
)

func TestMigrateTimestampsDryRunApplyAndIdempotency(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "tenant.db")

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("failed to open temp db: %v", err)
	}
	_, err = db.Exec(`
		CREATE TABLE orders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			created_at DATETIME,
			closed_at DATETIME
		);
		INSERT INTO orders (created_at, closed_at) VALUES
			('2026-10-01 12:30:00', '2026-10-01 09:30:00+00:00'),
			('2026-10-02T15:00:00', NULL);
	`)
	if err != nil {
		t.Fatalf("failed to seed orders table: %v", err)
	}
	_ = db.Close()

	// 1. Dry run reports 2 naive timestamps and creates no backup or changes
	dryStats, err := runMigration(tmpDir, false)
	if err != nil {
		t.Fatalf("dry-run failed: %v", err)
	}
	if dryStats.FilesScanned != 1 || dryStats.RowsUpdated != 2 {
		t.Fatalf("unexpected dry-run stats: %+v", dryStats)
	}
	baks, _ := filepath.Glob(dbPath + ".*.bak")
	if len(baks) != 0 {
		t.Fatalf("dry-run should not create backups, got %v", baks)
	}

	// 2. Apply converts naive Europe/Istanbul timestamps (-3h) to UTC and creates a .bak
	applyStats, err := runMigration(tmpDir, true)
	if err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	if applyStats.RowsUpdated != 2 {
		t.Fatalf("expected 2 updated rows, got %d", applyStats.RowsUpdated)
	}
	baks, _ = filepath.Glob(dbPath + ".*.bak")
	if len(baks) != 1 {
		t.Fatalf("expected 1 backup file after apply, got %d", len(baks))
	}

	checkDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("reopen failed: %v", err)
	}
	defer checkDB.Close()

	var c1, c1Closed, c2 string
	if err := checkDB.QueryRow(`SELECT CAST(created_at AS TEXT), CAST(closed_at AS TEXT) FROM orders WHERE id = 1`).Scan(&c1, &c1Closed); err != nil {
		t.Fatalf("query row 1 failed: %v", err)
	}
	if c1 != "2026-10-01 09:30:00+00:00" {
		t.Fatalf("expected row 1 created_at normalized to UTC 09:30:00+00:00, got %q", c1)
	}
	if c1Closed != "2026-10-01 09:30:00+00:00" {
		t.Fatalf("expected row 1 closed_at untouched, got %q", c1Closed)
	}
	if err := checkDB.QueryRow(`SELECT CAST(created_at AS TEXT) FROM orders WHERE id = 2`).Scan(&c2); err != nil {
		t.Fatalf("query row 2 failed: %v", err)
	}
	if !strings.HasPrefix(c2, "2026-10-02 12:00:00") || !strings.HasSuffix(c2, "+00:00") {
		t.Fatalf("expected row 2 normalized to 12:00 UTC, got %q", c2)
	}

	// 3. Re-running apply is idempotent (0 rows updated)
	secondStats, err := runMigration(tmpDir, true)
	if err != nil {
		t.Fatalf("second apply failed: %v", err)
	}
	if secondStats.RowsUpdated != 0 {
		t.Fatalf("expected idempotent 0 rows updated on re-run, got %d", secondStats.RowsUpdated)
	}
}
