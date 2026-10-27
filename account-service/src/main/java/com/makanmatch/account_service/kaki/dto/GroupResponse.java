package com.makanmatch.account_service.kaki.dto;

import java.util.List;
import java.util.UUID;

/** A saved group; members are sorted by display name and never include the owner. */
public record GroupResponse(UUID id, String name, List<Kaki> members) {
}
