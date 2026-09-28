package com.makanmatch.context_service.DTO;

/** A place's public, provider-independent representation. */
public record PlaceDto(String id, String name, double lat, double lng) {}
