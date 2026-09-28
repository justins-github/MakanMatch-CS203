package com.makanmatch.catalog_service.venue;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.makanmatch.catalog_service.common.BadRequestException;
import com.makanmatch.catalog_service.common.NotFoundException;
import com.makanmatch.catalog_service.security.Caller;
import com.makanmatch.catalog_service.security.VenueAccessPolicy;
import com.makanmatch.catalog_service.venue.dto.VenueResponse;
import com.makanmatch.catalog_service.venue.dto.VenueStatusResponse;
import com.makanmatch.catalog_service.venue.dto.VenueUpdateRequest;
import com.makanmatch.catalog_service.venue.dto.VenueUpdateResponse;

@Service
@Transactional
public class VenueService {

	private static final int MAX_RESULTS = 25;

	private final VenueRepository venues;
	private final VenueUpdateRepository updates;
	private final VenueAccessPolicy access;

	public VenueService(VenueRepository venues, VenueUpdateRepository updates, VenueAccessPolicy access) {
		this.venues = venues;
		this.updates = updates;
		this.access = access;
	}

	@Transactional(readOnly = true)
	public List<VenueResponse> search(String query, int limit) {
		String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
		if (q.length() < 2) throw new BadRequestException("Type at least 2 characters to search");
		List<Venue> found = venues.search(escapeLike(q), PageRequest.of(0, Math.min(Math.max(limit, 1), MAX_RESULTS)));
		Map<String, VenueStatusResponse> status = currentFor(found.stream().map(Venue::getId).toList());
		return found.stream().map(v -> VenueResponse.from(v, status.get(v.getId()))).toList();
	}

	@Transactional(readOnly = true)
	public VenueResponse get(String venueId) {
		Venue venue = find(venueId);
		return VenueResponse.from(venue, currentFor(List.of(venueId)).get(venueId));
	}

	@Transactional(readOnly = true)
	public List<VenueUpdateResponse> history(String venueId) {
		find(venueId);
		return updates.findByVenueIdOrderByCreatedAtDesc(venueId).stream().map(VenueUpdateResponse::from).toList();
	}

	/** Every venue's current owner-described state; the engine polls this to adjust recommendations. */
	@Transactional(readOnly = true)
	public List<VenueStatusResponse> currentStatuses() {
		return combine(updates.findLatestPerVenue(), updates.findLatestMovePerVenue());
	}

	public VenueUpdateResponse report(String venueId, VenueUpdateRequest request, Caller caller) {
		find(venueId);
		access.requireManager(caller, venueId);
		String newAddress = trimToNull(request.newAddress());
		if (request.status() == VenueStatus.MOVED && newAddress == null) {
			throw new BadRequestException("A new address is required when the venue has moved");
		}
		VenueUpdate saved = updates.save(new VenueUpdate(venueId, request.status(), newAddress,
				trimToNull(request.openingHours()), trimToNull(request.note()), caller.userId()));
		return VenueUpdateResponse.from(saved);
	}

	/** For other features: throws NotFound for an unknown venue id. */
	@Transactional(readOnly = true)
	public void requireExists(String venueId) {
		find(venueId);
	}

	private Venue find(String venueId) {
		return venues.findById(venueId).orElseThrow(() -> new NotFoundException("No such venue"));
	}

	private Map<String, VenueStatusResponse> currentFor(List<String> venueIds) {
		if (venueIds.isEmpty()) return Map.of();
		return combine(updates.findLatestFor(venueIds), updates.findLatestMoveFor(venueIds)).stream()
				.collect(Collectors.toMap(VenueStatusResponse::venueId, Function.identity()));
	}

	/** Latest report per venue, carrying the address from that venue's latest move. */
	private static List<VenueStatusResponse> combine(List<VenueUpdate> latest, List<VenueUpdate> latestMoves) {
		Map<String, VenueUpdate> moveByVenue = latestMoves.stream()
				.collect(Collectors.toMap(VenueUpdate::getVenueId, Function.identity()));
		return latest.stream().map(u -> VenueStatusResponse.of(u, moveByVenue.get(u.getVenueId()))).toList();
	}

	private static String escapeLike(String text) {
		return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
	}

	private static String trimToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}
}
