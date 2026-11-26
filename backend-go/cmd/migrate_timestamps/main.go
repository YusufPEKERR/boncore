package main

import (
	"database/sql"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	_ "github.com/glebarez/sqlite"
)

var (
	tzSuffixRe      = regexp.MustCompile(`(?i)(Z|[+-]\d{2}:?\d{2})$`)
	quotedIdentRepl = strings.NewReplacer(`"`, `""`)
)

func quoteIdent(name string) string {
	return `"` + quotedIdentRepl.Replace(name) + `"`
}

func turkeyLocation() *time.Location {
	if loc, err := time.LoadLocation("Europe/Istanbul"); err == nil {
		return loc
	}
	return time.FixedZone("TRT", 3*3600)
}

func isTimestampColumn(colName, colType string) bool {
	upperType := strings.ToUpper(strings.TrimSpace(colType))
	if strings.Contains(upperType, "DATETIME") || strings.Contains(upperType, "TIMESTAMP") {
		return true
	}
	lowerName := strings.ToLower(strings.TrimSpace(colName))
	return strings.HasSuffix(lowerName, "_at") || lowerName == "due_date"
}

// normalizeNaiveTimestamp converts a naive local-time SQLite timestamp string
// (without timezone offset) from Europe/Istanbul into canonical UTC format.
// Already-offset timestamps (ending in Z or +/-HH:MM) are returned unchanged.
func normalizeNaiveTimestamp(raw string, srcLoc *time.Location) (string, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return raw, false
	}
	if tzSuffixRe.MatchString(trimmed) {
		return raw, false
	}
	layouts := []string{
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05.999999999",
		"2006-01-02T15:04:05",
	}
	for _, layout := range layouts {
		if parsed, err := time.ParseInLocation(layout, trimmed, srcLoc); err == nil {
			return parsed.UTC().Format("2006-01-02 15:04:05.999999999+00:00"), true
		}
	}
	return raw, false
}

func copyFileBackup(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}

type migrationStats struct {
	FilesScanned int
	RowsScanned  int
	RowsUpdated  int
}

func migrateSQLiteFile(dbPath string, apply bool, srcLoc *time.Location) (int, int, error) {
	if apply {
		bakPath := dbPath + fmt.Sprintf(".%s.bak", time.Now().UTC().Format("20060102150405"))
		if err := copyFileBackup(dbPath, bakPath); err != nil {
			return 0, 0, fmt.Errorf("backup failed for %s: %w", dbPath, err)
		}
	}

	dsn := dbPath
	if !apply {
		dsn = dbPath + "?mode=ro"
	}
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return 0, 0, err
	}
	defer db.Close()

	tableRows, err := db.Query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
	if err != nil {
		return 0, 0, err
	}
	var tables []string
	for tableRows.Next() {
		var name string
		if err := tableRows.Scan(&name); err == nil {
			tables = append(tables, name)
		}
	}
	_ = tableRows.Close()

	scanned := 0
	updated := 0

	var tx *sql.Tx
	if apply {
		tx, err = db.Begin()
		if err != nil {
			return 0, 0, err
		}
		defer func() {
			if tx != nil {
				_ = tx.Rollback()
			}
		}()
	}

	for _, tbl := range tables {
		pragmaRows, err := db.Query(fmt.Sprintf(`PRAGMA table_info(%s)`, quoteIdent(tbl)))
		if err != nil {
			return scanned, updated, err
		}
		var tsCols []string
		hasRowID := false
		for pragmaRows.Next() {
			var cid int
			var name, ctype string
			var notnull int
			var dflt sql.NullString
			var pk int
			if err := pragmaRows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err == nil {
				if isTimestampColumn(name, ctype) {
					tsCols = append(tsCols, name)
				}
				if strings.EqualFold(name, "rowid") {
					hasRowID = true
				}
			}
		}
		_ = pragmaRows.Close()
		if len(tsCols) == 0 || hasRowID {
			continue
		}

		for _, col := range tsCols {
			q := fmt.Sprintf(`SELECT rowid, CAST(%s AS TEXT) FROM %s WHERE %s IS NOT NULL AND CAST(%s AS TEXT) != ''`,
				quoteIdent(col), quoteIdent(tbl), quoteIdent(col), quoteIdent(col))
			rows, err := db.Query(q)
			if err != nil {
				continue
			}
			type pendingUpdate struct {
				rowid int64
				val   string
			}
			var pending []pendingUpdate
			for rows.Next() {
				var rowid int64
				var raw sql.NullString
				if err := rows.Scan(&rowid, &raw); err != nil || !raw.Valid {
					continue
				}
				scanned++
				if converted, changed := normalizeNaiveTimestamp(raw.String, srcLoc); changed {
					pending = append(pending, pendingUpdate{rowid: rowid, val: converted})
				}
			}
			_ = rows.Close()

			if len(pending) > 0 {
				updated += len(pending)
				if apply && tx != nil {
					updStmt, err := tx.Prepare(fmt.Sprintf(`UPDATE %s SET %s = ? WHERE rowid = ?`, quoteIdent(tbl), quoteIdent(col)))
					if err != nil {
						return scanned, updated, err
					}
					for _, p := range pending {
						if _, err := updStmt.Exec(p.val, p.rowid); err != nil {
							_ = updStmt.Close()
							return scanned, updated, err
						}
					}
					_ = updStmt.Close()
				}
			}
		}
	}

	if apply && tx != nil {
		if err := tx.Commit(); err != nil {
			return scanned, updated, err
		}
		tx = nil
	}
	return scanned, updated, nil
}

func runMigration(dir string, apply bool) (migrationStats, error) {
	stats := migrationStats{}
	srcLoc := turkeyLocation()
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if !strings.EqualFold(filepath.Ext(d.Name()), ".db") {
			return nil
		}
		scanned, updated, err := migrateSQLiteFile(path, apply, srcLoc)
		if err != nil {
			return err
		}
		stats.FilesScanned++
		stats.RowsScanned += scanned
		stats.RowsUpdated += updated
		mode := "DRY-RUN"
		if apply {
			mode = "APPLIED"
		}
		log.Printf("[%s] %s: scanned=%d to_update=%d", mode, path, scanned, updated)
		return nil
	})
	return stats, err
}

func main() {
	dir := flag.String("dir", "./data", "Directory containing SQLite .db files")
	dryRun := flag.Bool("dry-run", true, "Inspect naive timestamps without writing changes")
	apply := flag.Bool("apply", false, "Create .bak backups and normalize naive timestamps to UTC")
	flag.Parse()

	shouldApply := *apply && (!isFlagSet("dry-run") || !*dryRun)

	stats, err := runMigration(*dir, shouldApply)
	if err != nil {
		log.Fatalf("[FATAL] Timestamp migration failed: %v", err)
	}
	log.Printf("[DONE] files=%d rows_scanned=%d rows_normalized=%d apply=%v",
		stats.FilesScanned, stats.RowsScanned, stats.RowsUpdated, shouldApply)
}

func isFlagSet(name string) bool {
	found := false
	flag.Visit(func(f *flag.Flag) {
		if f.Name == name {
			found = true
		}
	})
	return found
}
