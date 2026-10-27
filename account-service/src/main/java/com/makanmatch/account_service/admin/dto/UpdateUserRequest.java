package com.makanmatch.account_service.admin.dto;

/** Partial update: a null field is left unchanged. */
public record UpdateUserRequest(Boolean admin, Boolean disabled) {
}
