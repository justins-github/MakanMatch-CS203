package com.makanmatch.catalog_service.venue;

import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.makanmatch.catalog_service.security.Caller;
import com.makanmatch.catalog_service.venue.dto.OpeningHoursRequest;
import com.makanmatch.catalog_service.venue.dto.OpeningHoursResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/catalog")
@Tag(name = "Opening hours", description = "Owner-set weekly hours (reads are public)")
public class OpeningHoursController {

	private final OpeningHoursService hours;

	public OpeningHoursController(OpeningHoursService hours) {
		this.hours = hours;
	}

	@GetMapping("/venues/{id}/hours")
	@Operation(summary = "A venue's weekly hours; an empty week means the owner hasn't set any")
	public OpeningHoursResponse get(@PathVariable String id) {
		return hours.get(id);
	}

	@PutMapping("/venues/{id}/hours")
	@SecurityRequirement(name = "bearer")
	@Operation(summary = "Replace a venue's weekly hours (owners only); days left out are closed")
	public OpeningHoursResponse replace(@AuthenticationPrincipal Jwt jwt,
			@RequestHeader(name = "X-Act-As", required = false) String actAs,
			@PathVariable String id, @Valid @RequestBody OpeningHoursRequest body) {
		return hours.replace(id, body, Caller.of(jwt, actAs));
	}

	@GetMapping("/venue-hours")
	@Operation(summary = "Every venue's weekly hours (only venues whose owner set them)")
	public List<OpeningHoursResponse> all() {
		return hours.all();
	}
}
