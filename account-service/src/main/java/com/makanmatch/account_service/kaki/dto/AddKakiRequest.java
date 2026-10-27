package com.makanmatch.account_service.kaki.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** @param username matched case-insensitively; a leading "@" is ignored */
public record AddKakiRequest(@NotBlank @Size(max = 50) String username) {
}
