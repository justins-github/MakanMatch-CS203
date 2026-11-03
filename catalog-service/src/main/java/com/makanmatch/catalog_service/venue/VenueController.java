package com.makanmatch.catalog_service.venue;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.makanmatch.catalog_service.security.Caller;
import com.makanmatch.catalog_service.venue.dto.VenueResponse;
import com.makanmatch.catalog_service.venue.dto.VenueStatusResponse;
import com.makanmatch.catalog_service.venue.dto.VenueUpdateRequest;
import com.makanmatch.catalog_service.venue.dto.VenueUpdateResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/catalog")
@Tag(name = "Venues", description = "The venue registry and owner-reported status (reads are public)")
public class VenueController {

	private final VenueService venues;

	public VenueController(VenueService venues) {
		this.venues = venues;
	}

	@GetMapping("/venues")
	@Operation(summary = "Search venues by name (at least 2 characters)")
	public List<VenueResponse> search(@RequestParam String q, @RequestParam(defaultValue = "10") int limit) {
		return venues.search(q, limit);
	}

	@GetMapping("/venues/{id}")
	@Operation(summary = "One venue with its current owner-reported status")
	public VenueResponse get(@PathVariable String id) {
		return venues.get(id);
	}

	@GetMapping("/venues/{id}/updates")
	@Operation(summary = "Every status report for a venue, newest first")
	public List<VenueUpdateResponse> history(@PathVariable String id) {
		return venues.history(id);
	}

	@PostMapping("/venues/{id}/updates")
	@ResponseStatus(HttpStatus.CREATED)
	@SecurityRequirement(name = "bearer")
	@Operation(summary = "Report the venue's status: open, temporarily closed, closed or moved (owners only)")
	public VenueUpdateResponse report(@AuthenticationPrincipal Jwt jwt,
			@RequestHeader(name = "X-Act-As", required = false) String actAs,
			@PathVariable String id, @Valid @RequestBody VenueUpdateRequest body) {
		return venues.report(id, body, Caller.of(jwt, actAs));
	}

	@GetMapping("/venue-status")
	@Operation(summary = "Every venue's current owner-reported status and address (only venues with reports)")
	public List<VenueStatusResponse> currentStatuses() {
		return venues.currentStatuses();
	}
}
