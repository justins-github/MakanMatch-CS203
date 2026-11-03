package com.makanmatch.catalog_service.menu;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.stereotype.Component;

/**
 * Stand-in until photo reading is connected. It ignores the photo and returns a
 * fixed hawker menu, flagged as a sample so the owner's page says so. The follow-up
 * is a reader that sends the photo to a vision model (Claude) and returns what it
 * reads; registering it as the MenuReader bean (e.g. when ANTHROPIC_API_KEY is set)
 * is the only change needed.
 */
@Component
public class SampleMenuReader implements MenuReader {

	private static final List<ReadDish> SAMPLE = List.of(
			new ReadDish("Chicken rice", new BigDecimal("4.50")),
			new ReadDish("Char kway teow", new BigDecimal("5.00")),
			new ReadDish("Fishball noodles", new BigDecimal("4.00")),
			new ReadDish("Teh tarik", new BigDecimal("1.80")),
			new ReadDish("Kopi O", new BigDecimal("1.40")),
			new ReadDish("Lime juice", new BigDecimal("2.00")));

	@Override
	public Reading read(byte[] photo, String mediaType) {
		return new Reading(true, SAMPLE);
	}
}
