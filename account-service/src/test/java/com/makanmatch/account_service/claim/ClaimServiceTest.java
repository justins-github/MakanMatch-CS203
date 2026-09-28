package com.makanmatch.account_service.claim;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.makanmatch.account_service.claim.dto.ClaimResponse;
import com.makanmatch.account_service.claim.dto.CreateClaimRequest;
import com.makanmatch.account_service.common.ConflictException;
import com.makanmatch.account_service.common.ForbiddenException;
import com.makanmatch.account_service.common.NotFoundException;
import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.profile.ProfileService;

@ExtendWith(MockitoExtension.class)
class ClaimServiceTest {

	private static final UUID OWNER = UUID.randomUUID();
	private static final UUID ADMIN = UUID.randomUUID();
	private static final CreateClaimRequest REQUEST =
			new CreateClaimRequest("turks-kebab", "Turk's Kebab", "UEN 201912345K, call the stall to verify");

	@Mock
	VenueClaimRepository claims;
	@Mock
	OwnershipService ownership;
	@Mock
	ProfileService profiles;

	ClaimService service;

	@BeforeEach
	void setUp() {
		service = new ClaimService(claims, ownership, profiles);
		lenient().when(profiles.findAll(any())).thenReturn(Map.of());
		lenient().when(claims.save(any())).thenAnswer(call -> call.getArgument(0));
	}

	@Test
	void newClaimsStartPending() {
		ClaimResponse created = service.create(OWNER, REQUEST);
		assertThat(created.status()).isEqualTo(ClaimStatus.PENDING);
		assertThat(created.proof()).startsWith("UEN");
	}

	@Test
	void youCannotClaimAVenueYouAlreadyManage() {
		given(ownership.owns(OWNER, "turks-kebab")).willReturn(true);
		assertThatThrownBy(() -> service.create(OWNER, REQUEST)).isInstanceOf(ConflictException.class);
	}

	@Test
	void onlyOnePendingClaimPerVenue() {
		given(claims.existsByUserIdAndVenueIdAndStatus(OWNER, "turks-kebab", ClaimStatus.PENDING)).willReturn(true);
		assertThatThrownBy(() -> service.create(OWNER, REQUEST)).isInstanceOf(ConflictException.class);
	}

	@Test
	void approvalGrantsOwnership() {
		VenueClaim claim = pendingClaim(OWNER);

		ClaimResponse approved = service.approve(ADMIN, claim.getId());

		assertThat(approved.status()).isEqualTo(ClaimStatus.APPROVED);
		verify(ownership).grant(OWNER, "turks-kebab", "Turk's Kebab", claim.getId());
	}

	@Test
	void adminsCannotApproveTheirOwnClaims() {
		VenueClaim claim = pendingClaim(ADMIN);

		assertThatThrownBy(() -> service.approve(ADMIN, claim.getId())).isInstanceOf(ForbiddenException.class);
		verify(ownership, never()).grant(any(), anyString(), anyString(), any());
	}

	@Test
	void aDecidedClaimCannotBeDecidedAgain() {
		VenueClaim claim = pendingClaim(OWNER);
		service.reject(ADMIN, claim.getId(), "Could not verify the UEN");

		assertThatThrownBy(() -> service.approve(ADMIN, claim.getId())).isInstanceOf(ConflictException.class);
		assertThat(claim.getRejectReason()).isEqualTo("Could not verify the UEN");
	}

	@Test
	void someoneElsesClaimLooksMissing() {
		VenueClaim claim = pendingClaim(OWNER);
		assertThatThrownBy(() -> service.withdraw(UUID.randomUUID(), claim.getId()))
				.isInstanceOf(NotFoundException.class);
	}

	private VenueClaim pendingClaim(UUID claimant) {
		VenueClaim claim = new VenueClaim(claimant, REQUEST.venueId(), REQUEST.venueName(), REQUEST.proof());
		lenient().when(claims.findById(claim.getId())).thenReturn(Optional.of(claim));
		return claim;
	}
}
