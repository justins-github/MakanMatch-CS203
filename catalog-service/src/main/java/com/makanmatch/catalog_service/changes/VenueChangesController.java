package com.makanmatch.catalog_service.changes;

import java.time.Instant;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/catalog")
@Tag(name = "Changes", description = "What changed at a venue since a moment (public)")
public class VenueChangesController {

	private final VenueChangesService changes;

	public VenueChangesController(VenueChangesService changes) {
		this.changes = changes;
	}

	@GetMapping("/venues/{venueId}/changes")
	@Operation(summary = "Price changes, dishes added and removed, and owner reports since `since` (ISO-8601)")
	public VenueChangesResponse changes(@PathVariable String venueId, @RequestParam Instant since) {
		return changes.since(venueId, since);
	}
}
