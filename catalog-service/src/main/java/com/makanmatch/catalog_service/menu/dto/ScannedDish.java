package com.makanmatch.catalog_service.menu.dto;

import java.math.BigDecimal;

/**
 * One dish read off a menu photo, not saved yet.
 *
 * @param dishId the live dish it matches by name, or null for a dish not on the menu yet
 * @param price  null when the photo shows no price
 */
public record ScannedDish(String name, BigDecimal price, String dishId) {
}
