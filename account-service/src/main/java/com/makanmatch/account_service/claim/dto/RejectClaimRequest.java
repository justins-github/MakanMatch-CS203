package com.makanmatch.account_service.claim.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** The reason is shown to the person who made the claim. */
public record RejectClaimRequest(@NotBlank @Size(max = 500) String reason) {
}
