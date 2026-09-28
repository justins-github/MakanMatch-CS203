package com.makanmatch.catalog_service.venue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.makanmatch.catalog_service.common.BadRequestException;
import com.makanmatch.catalog_service.common.ForbiddenException;
import com.makanmatch.catalog_service.common.NotFoundException;
import com.makanmatch.catalog_service.security.Caller;
import com.makanmatch.catalog_service.security.VenueAccessPolicy;
import com.makanmatch.catalog_service.venue.dto.VenueStatusResponse;
import com.makanmatch.catalog_service.venue.dto.VenueUpdateRequest;
import com.makanmatch.catalog_service.venue.dto.VenueUpdateResponse;

@ExtendWith(MockitoExtension.class)
class VenueServiceTest {

	private static final Caller OWNER = new Caller(UUID.randomUUID(), "token", null);

	@Mock
	VenueRepository venues;
	@Mock
	VenueUpdateRepository updates;
	@Mock
	VenueAccessPolicy access;

	VenueService service;

	@BeforeEach
	void setUp() {
		service = new VenueService(venues, updates, access);
	}

	@Test
	void ownersCanReportAMove() {
		givenVenue("turks-kebab");
		given(updates.save(any())).willAnswer(call -> call.getArgument(0));

		VenueUpdateResponse saved = service.report("turks-kebab",
				new VenueUpdateRequest(VenueStatus.MOVED, " 35 Selegie Rd #01-C2 ", null, "Moved from Peace Centre"),
				OWNER);

		assertThat(saved.status()).isEqualTo(VenueStatus.MOVED);
		assertThat(saved.newAddress()).isEqualTo("35 Selegie Rd #01-C2");
	}

	@Test
	void aMoveNeedsTheNewAddress() {
		givenVenue("turks-kebab");
		assertThatThrownBy(() -> service.report("turks-kebab",
				new VenueUpdateRequest(VenueStatus.MOVED, "  ", null, null), OWNER))
				.isInstanceOf(BadRequestException.class);
		verify(updates, never()).save(any());
	}

	@Test
	void onlyOwnersCanReport() {
		givenVenue("turks-kebab");
		willThrow(new ForbiddenException("no")).given(access).requireManager(OWNER, "turks-kebab");

		assertThatThrownBy(() -> service.report("turks-kebab",
				new VenueUpdateRequest(VenueStatus.CLOSED, null, null, null), OWNER))
				.isInstanceOf(ForbiddenException.class);
		verify(updates, never()).save(any());
	}

	@Test
	void aMoveStaysTrueAfterLaterReports() {
		VenueUpdate moved = new VenueUpdate("turks-kebab", VenueStatus.MOVED, "35 Selegie Rd #01-C2", null, null, UUID.randomUUID());
		VenueUpdate openAgain = new VenueUpdate("turks-kebab", VenueStatus.OPEN, null, "Daily 10am-10pm", null, UUID.randomUUID());
		given(updates.findLatestPerVenue()).willReturn(List.of(openAgain));
		given(updates.findLatestMovePerVenue()).willReturn(List.of(moved));

		VenueStatusResponse current = service.currentStatuses().get(0);

		assertThat(current.status()).isEqualTo(VenueStatus.OPEN);
		assertThat(current.currentAddress()).isEqualTo("35 Selegie Rd #01-C2");
		assertThat(current.openingHours()).isEqualTo("Daily 10am-10pm");
	}

	@Test
	void unknownVenuesAreNotFound() {
		given(venues.findById("nope")).willReturn(Optional.empty());
		assertThatThrownBy(() -> service.get("nope")).isInstanceOf(NotFoundException.class);
	}

	@Test
	void searchNeedsTwoCharacters() {
		assertThatThrownBy(() -> service.search("k", 10)).isInstanceOf(BadRequestException.class);
	}

	private void givenVenue(String id) {
		given(venues.findById(id)).willReturn(Optional.of(new Venue(id, "Turk's Kebab", "community+overture")));
	}
}
