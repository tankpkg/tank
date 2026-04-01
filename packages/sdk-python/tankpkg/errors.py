class TankError(Exception):
    def __init__(self, message: str, *, status: int | None = None, cause: Exception | None = None):
        super().__init__(message)
        self.status = status
        self.__cause__ = cause


class TankAuthError(TankError):
    def __init__(self, message: str = "Authentication failed. Valid API key required."):
        super().__init__(message, status=401)


class TankNotFoundError(TankError):
    def __init__(self, message: str, *, skill_name: str | None = None):
        super().__init__(message, status=404)
        self.skill_name = skill_name


class TankPermissionError(TankError):
    def __init__(self, message: str):
        super().__init__(message, status=403)


class TankNetworkError(TankError):
    def __init__(self, message: str, *, cause: Exception | None = None):
        super().__init__(message, cause=cause)


class TankIntegrityError(TankError):
    def __init__(self, message: str, *, expected: str | None = None, actual: str | None = None):
        super().__init__(message)
        self.expected = expected
        self.actual = actual


class TankConflictError(TankError):
    def __init__(self, message: str, *, details: str | None = None):
        super().__init__(message, status=409)
        self.details = details
