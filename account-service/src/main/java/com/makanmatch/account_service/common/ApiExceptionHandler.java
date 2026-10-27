package com.makanmatch.account_service.common;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Turns domain exceptions into RFC 9457 problem responses, so services never
 * deal with HTTP and every error body has the same shape.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

	@ExceptionHandler(BadRequestException.class)
	ProblemDetail badRequest(BadRequestException e) {
		return problem(HttpStatus.BAD_REQUEST, e.getMessage());
	}

	@ExceptionHandler(NotFoundException.class)
	ProblemDetail notFound(NotFoundException e) {
		return problem(HttpStatus.NOT_FOUND, e.getMessage());
	}

	@ExceptionHandler(ConflictException.class)
	ProblemDetail conflict(ConflictException e) {
		return problem(HttpStatus.CONFLICT, e.getMessage());
	}

	@ExceptionHandler(ForbiddenException.class)
	ProblemDetail forbidden(ForbiddenException e) {
		return problem(HttpStatus.FORBIDDEN, e.getMessage());
	}

	@ExceptionHandler(UnauthorizedException.class)
	ProblemDetail unauthorized(UnauthorizedException e) {
		return problem(HttpStatus.UNAUTHORIZED, e.getMessage());
	}

	/** Lists each invalid field instead of the default "Invalid request content." */
	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		Map<String, String> errors = new LinkedHashMap<>();
		for (FieldError error : ex.getBindingResult().getFieldErrors()) {
			errors.putIfAbsent(error.getField(), error.getDefaultMessage());
		}
		ProblemDetail body = problem(HttpStatus.BAD_REQUEST, "Some fields are invalid");
		body.setProperty("errors", errors);
		return handleExceptionInternal(ex, body, headers, status, request);
	}

	private static ProblemDetail problem(HttpStatus status, String detail) {
		return ProblemDetail.forStatusAndDetail(status, detail == null ? status.getReasonPhrase() : detail);
	}
}
