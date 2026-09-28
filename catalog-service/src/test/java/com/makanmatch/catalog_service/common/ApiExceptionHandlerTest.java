package com.makanmatch.catalog_service.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

class ApiExceptionHandlerTest {

	@Test
	void anOversizedPhotoGetsAPlainAnswer() {
		ResponseEntity<Object> response = new ApiExceptionHandler().handleMaxUploadSizeExceededException(
				new MaxUploadSizeExceededException(5L * 1024 * 1024), new HttpHeaders(), HttpStatus.PAYLOAD_TOO_LARGE,
				new ServletWebRequest(new MockHttpServletRequest()));

		assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
		assertThat(((ProblemDetail) response.getBody()).getDetail()).isEqualTo("Photos can be at most 5 MB");
	}
}
