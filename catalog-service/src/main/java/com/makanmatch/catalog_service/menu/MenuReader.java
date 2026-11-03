package com.makanmatch.catalog_service.menu;

import java.math.BigDecimal;
import java.util.List;

/**
 * Reads dishes and prices off a photo of a menu. Today only {@link SampleMenuReader}
 * exists; a reader backed by a vision model (Claude) replaces it later without the
 * endpoint or the owner's page changing.
 */
@FunctionalInterface
public interface MenuReader {

	/**
	 * @param photo     the image bytes, already checked to be a real photo
	 * @param mediaType "image/jpeg", "image/png" or "image/webp"
	 */
	Reading read(byte[] photo, String mediaType);

	/** @param sample true when the dishes are made up rather than read from the photo */
	record Reading(boolean sample, List<ReadDish> dishes) {
	}

	/** @param price null when the photo shows no price for the dish */
	record ReadDish(String name, BigDecimal price) {
	}
}
