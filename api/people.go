package main

import (
	"encoding/json"
	"errors"
	"log"
	"math"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

// maxWeeklyHours is the hours in a week; anything above is a typo.
const maxWeeklyHours = 168

type updatePersonRequest struct {
	WeeklyHours *float64 `json:"weeklyHours"`
}

type person struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
}

// handleUpdatePerson serves PATCH /api/people/{id} with {"weeklyHours": n}.
//
// It sets an absolute value, so a retried or duplicated request is harmless.
// It returns the stored person, which is everything the grid needs to
// update its row: capacity changes, allocation does not.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		http.Error(w, "person id must be a positive integer", http.StatusBadRequest)
		return
	}

	var body updatePersonRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		http.Error(w, "body must be {\"weeklyHours\": number}", http.StatusBadRequest)
		return
	}
	if body.WeeklyHours == nil || math.IsNaN(*body.WeeklyHours) || math.IsInf(*body.WeeklyHours, 0) ||
		*body.WeeklyHours < 0 || *body.WeeklyHours > maxWeeklyHours {
		http.Error(w, "weeklyHours must be a number between 0 and 168", http.StatusBadRequest)
		return
	}

	var p person
	err = s.db.QueryRow(r.Context(), `
		UPDATE people SET weekly_hours = $1
		WHERE id = $2
		RETURNING id, name, weekly_hours::float8`, *body.WeeklyHours, id,
	).Scan(&p.ID, &p.Name, &p.WeeklyHours)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "person not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("update person %d: %v", id, err)
		http.Error(w, "update failed", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, p)
}
