package com.makanmatch.context_service.exception;

public class NeaException extends RuntimeException {
    public NeaException(String message) {
        super(message);
    }

    public NeaException(String message, Throwable cause) {
        super(message, cause);
    }
}
