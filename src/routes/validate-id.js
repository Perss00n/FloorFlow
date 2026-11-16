export function validateId(request, response, next, value) {
  const id = Number(value);

  if (!/^\d+$/.test(value) || !Number.isInteger(id) || id < 1 || id > 2147483647) {
    return response.status(400).json({
      error: 'ID must be a positive integer between 1 and 2147483647.',
    });
  }

  next();
}
