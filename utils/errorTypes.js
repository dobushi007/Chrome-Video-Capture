class NotFoundError extends Error {
  constructor(message = 'Not Found') {
    super();
    this.message = message;
  }
}

class BadRequestError extends Error {
  constructor(message = 'Bad Request') {
    super();
    this.message = message;
  }
}

class InternalServerError extends Error {
  constructor(message = 'Internal Server Error') {
    super();
    this.message = message;
  }
}

class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super();
    this.message = message;
    this.title = 'User Permissions Issue';
  }
}

export { BadRequestError, ForbiddenError, InternalServerError, NotFoundError };
