package com.makanmatch.catalog_service.menu;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.makanmatch.catalog_service.common.BadRequestException;
import com.makanmatch.catalog_service.menu.MenuReader.ReadDish;
import com.makanmatch.catalog_service.menu.MenuReader.Reading;
import com.makanmatch.catalog_service.menu.dto.MenuScanResponse;
import com.makanmatch.catalog_service.menu.dto.ScannedDish;
import com.makanmatch.catalog_service.security.Caller;
import com.makanmatch.catalog_service.security.VenueAccessPolicy;
import com.makanmatch.catalog_service.venue.VenueService;

/**
 * Turns an owner's menu photo into a proposed price list. Nothing is saved and the
 * photo is not kept: the owner reviews the rows and saves them as a price-list edit.
 */
@Service
@Transactional(readOnly = true)
public class MenuScanService {

	/** Same as spring.servlet.multipart.max-file-size; phones shrink photos well below this first. */
	static final int MAX_PHOTO_BYTES = 5 * 1024 * 1024;

	private final MenuReader reader;
	private final DishRepository dishes;
	private final VenueService venues;
	private final VenueAccessPolicy access;

	public MenuScanService(MenuReader reader, DishRepository dishes, VenueService venues, VenueAccessPolicy access) {
		this.reader = reader;
		this.dishes = dishes;
		this.venues = venues;
		this.access = access;
	}

	public MenuScanResponse scan(String venueId, byte[] photo, Caller caller) {
		venues.requireExists(venueId);
		access.requireManager(caller, venueId);
		if (photo == null || photo.length == 0) throw new BadRequestException("The photo is empty");
		if (photo.length > MAX_PHOTO_BYTES) throw new BadRequestException("Photos can be at most 5 MB");
		String mediaType = mediaTypeOf(photo);
		if (mediaType == null) throw new BadRequestException("That file isn't a JPEG, PNG or WebP photo");

		Reading reading = reader.read(photo, mediaType);
		Map<String, Dish> live = dishes.findByVenueIdAndArchivedFalseOrderByNameAsc(venueId).stream()
				.collect(Collectors.toMap(d -> key(d.getName()), Function.identity(), (a, b) -> a));
		Set<String> seen = new HashSet<>();
		List<ScannedDish> rows = new ArrayList<>();
		for (ReadDish read : reading.dishes()) {
			String name = MenuService.normalizeName(read.name());
			if (name.isEmpty() || !seen.add(key(name))) continue;
			Dish match = live.get(key(name));
			rows.add(match == null
					? new ScannedDish(name, read.price(), null)
					: new ScannedDish(match.getName(), read.price(), match.getId()));
		}
		return new MenuScanResponse(reading.sample(), rows);
	}

	private static String key(String name) {
		return name.toLowerCase(Locale.ROOT);
	}

	/** From the file's first bytes, not its claimed type: JPEG, PNG and WebP only. */
	static String mediaTypeOf(byte[] photo) {
		if (startsWith(photo, 0, 0xFF, 0xD8, 0xFF)) return "image/jpeg";
		if (startsWith(photo, 0, 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A)) return "image/png";
		if (startsWith(photo, 0, 'R', 'I', 'F', 'F') && startsWith(photo, 8, 'W', 'E', 'B', 'P')) return "image/webp";
		return null;
	}

	private static boolean startsWith(byte[] data, int offset, int... expected) {
		if (data.length < offset + expected.length) return false;
		return Arrays.equals(Arrays.copyOfRange(data, offset, offset + expected.length),
				toBytes(expected));
	}

	private static byte[] toBytes(int[] values) {
		byte[] out = new byte[values.length];
		for (int i = 0; i < values.length; i++) out[i] = (byte) values[i];
		return out;
	}
}
