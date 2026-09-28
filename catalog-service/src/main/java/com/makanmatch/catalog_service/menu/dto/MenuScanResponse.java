package com.makanmatch.catalog_service.menu.dto;

import java.util.List;

/**
 * What a menu photo says, for the owner to review; nothing is saved until they
 * send the edit to PATCH /venues/{id}/dishes.
 *
 * @param sample true while photo reading isn't connected: the dishes are a made-up sample
 */
public record MenuScanResponse(boolean sample, List<ScannedDish> dishes) {
}
