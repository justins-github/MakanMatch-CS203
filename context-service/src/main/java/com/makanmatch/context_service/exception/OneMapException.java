package com.makanmatch.context_service.exception;

public class OneMapException extends RuntimeException{
    OneMapException(String error_message, Throwable cause ) {
        super(error_message, cause);

    }
}
