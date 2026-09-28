package com.makanmatch.context_service.exception;

public class OneMapException extends RuntimeException {

    public OneMapException(String message) {
        super(message);
    }

    public OneMapException(String message, Throwable cause) {
        super(message, cause);
    }
}
