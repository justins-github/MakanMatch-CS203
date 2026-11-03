package com.makanmatch.account_service.kaki.dto;

import java.util.List;

/**
 * Everyone the signed-in person is linked to, each list oldest first.
 *
 * @param incoming requests they can accept or decline
 * @param outgoing requests they sent and can cancel
 */
public record KakisResponse(List<Kaki> kakis, List<Kaki> incoming, List<Kaki> outgoing) {
}
