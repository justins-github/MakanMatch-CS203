package com.makanmatch.catalog_service.menu;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.makanmatch.catalog_service.common.BadRequestException;
import com.makanmatch.catalog_service.common.ForbiddenException;
import com.makanmatch.catalog_service.menu.MenuReader.ReadDish;
import com.makanmatch.catalog_service.menu.MenuReader.Reading;
import com.makanmatch.catalog_service.menu.dto.MenuScanResponse;
import com.makanmatch.catalog_service.menu.dto.ScannedDish;
import com.makanmatch.catalog_service.security.Caller;
import com.makanmatch.catalog_service.security.VenueAccessPolicy;
import com.makanmatch.catalog_service.venue.VenueService;

@ExtendWith(MockitoExtension.class)
class MenuScanServiceTest {

	private static final Caller OWNER = new Caller(UUID.randomUUID(), "token", null);
	private static final byte[] JPEG = bytes(0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 'J', 'F', 'I', 'F');
	private static final byte[] PNG = bytes(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D);
	private static final byte[] WEBP = bytes('R', 'I', 'F', 'F', 0x24, 0, 0, 0, 'W', 'E', 'B', 'P', 'V', 'P', '8');

	@Mock
	DishRepository dishes;
	@Mock
	VenueService venues;
	@Mock
	VenueAccessPolicy access;

	/** What the reader was asked to read, and what it answers. */
	final List<String> mediaTypesRead = new ArrayList<>();
	Reading answer = new Reading(true, List.of());

	MenuScanService service;

	@BeforeEach
	void setUp() {
		MenuReader reader = (photo, mediaType) -> {
			mediaTypesRead.add(mediaType);
			return answer;
		};
		service = new MenuScanService(reader, dishes, venues, access);
	}

	@Test
	void dishesOnThePhotoAreMatchedToTheMenuByName() {
		Dish chickenRice = new Dish("hawker", "Chicken rice", ReportSource.OWNER, null);
		given(dishes.findByVenueIdAndArchivedFalseOrderByNameAsc("hawker")).willReturn(List.of(chickenRice));
		answer = new Reading(false, List.of(
				new ReadDish(" chicken   RICE ", new BigDecimal("5.00")),
				new ReadDish("Teh tarik", new BigDecimal("1.80"))));

		MenuScanResponse scan = service.scan("hawker", JPEG, OWNER);

		assertThat(scan.sample()).isFalse();
		assertThat(scan.dishes()).containsExactly(
				new ScannedDish("Chicken rice", new BigDecimal("5.00"), chickenRice.getId()),
				new ScannedDish("Teh tarik", new BigDecimal("1.80"), null));
		assertThat(mediaTypesRead).containsExactly("image/jpeg");
	}

	@Test
	void repeatedAndBlankNamesAreDropped() {
		given(dishes.findByVenueIdAndArchivedFalseOrderByNameAsc("hawker")).willReturn(List.of());
		answer = new Reading(true, List.of(
				new ReadDish("Teh tarik", new BigDecimal("1.80")),
				new ReadDish("  ", BigDecimal.ONE),
				new ReadDish("TEH TARIK", new BigDecimal("2.00"))));

		assertThat(service.scan("hawker", JPEG, OWNER).dishes())
				.containsExactly(new ScannedDish("Teh tarik", new BigDecimal("1.80"), null));
	}

	@Test
	void pngAndWebpPhotosAreReadToo() {
		given(dishes.findByVenueIdAndArchivedFalseOrderByNameAsc("hawker")).willReturn(List.of());
		service.scan("hawker", PNG, OWNER);
		service.scan("hawker", WEBP, OWNER);
		assertThat(mediaTypesRead).containsExactly("image/png", "image/webp");
	}

	@Test
	void onlyPhotosAreRead() {
		assertRejected("menu.pdf".getBytes(StandardCharsets.UTF_8), "That file isn't a JPEG, PNG or WebP photo");
	}

	@Test
	void anEmptyUploadIsRejected() {
		assertRejected(new byte[0], "The photo is empty");
	}

	@Test
	void photosOver5MbAreRejected() {
		byte[] huge = new byte[MenuScanService.MAX_PHOTO_BYTES + 1];
		System.arraycopy(JPEG, 0, huge, 0, JPEG.length);
		assertRejected(huge, "Photos can be at most 5 MB");
	}

	@Test
	void onlyOwnersCanScanTheirMenu() {
		willThrow(new ForbiddenException("no")).given(access).requireManager(OWNER, "hawker");
		assertThatThrownBy(() -> service.scan("hawker", JPEG, OWNER)).isInstanceOf(ForbiddenException.class);
		assertThat(mediaTypesRead).isEmpty();
	}

	@Test
	void theSampleReaderSaysItIsASample() {
		Reading reading = new SampleMenuReader().read(JPEG, "image/jpeg");
		assertThat(reading.sample()).isTrue();
		assertThat(reading.dishes()).isNotEmpty();
	}

	private void assertRejected(byte[] photo, String message) {
		assertThatThrownBy(() -> service.scan("hawker", photo, OWNER))
				.isInstanceOf(BadRequestException.class)
				.hasMessage(message);
		assertThat(mediaTypesRead).isEmpty();
	}

	private static byte[] bytes(int... values) {
		byte[] out = new byte[values.length];
		for (int i = 0; i < values.length; i++) out[i] = (byte) values[i];
		return out;
	}
}
