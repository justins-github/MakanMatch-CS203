package com.makanmatch.account_service.claim.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * @param proof free text for the admin, e.g. business registration (UEN), a phone
 *              number listed for the venue, or how to verify in person. Required.
 */
public record CreateClaimRequest(
		@NotBlank @Size(max = 200) String venueId,
		@NotBlank @Size(max = 200) String venueName,
		@NotBlank @Size(min = 10, max = 2000, message = "must be 10-2000 characters") String proof) {
}
