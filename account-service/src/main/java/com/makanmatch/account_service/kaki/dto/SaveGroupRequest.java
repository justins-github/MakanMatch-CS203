package com.makanmatch.account_service.kaki.dto;

import java.util.List;
import java.util.UUID;

/**
 * Creates a group, or replaces one's name and members. The rules (name 1-40
 * characters after trimming, 1-9 of your kakis) are checked in KakiService.
 */
public record SaveGroupRequest(String name, List<UUID> memberIds) {
}
