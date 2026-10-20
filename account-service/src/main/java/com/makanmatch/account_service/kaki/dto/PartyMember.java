package com.makanmatch.account_service.kaki.dto;

import java.util.List;
import java.util.UUID;

/**
 * Someone the engine is matching a place for.
 *
 * @param restrictions their DietaryNeeds.Restriction names, e.g. "HALAL", in option order
 */
public record PartyMember(UUID id, String displayName, List<String> restrictions) {
}
