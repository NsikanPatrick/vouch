import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../auth/entities/user.entity';

describe('RolesGuard', () => {
    let guard: RolesGuard;
    let reflector: Reflector;

    const mockReflector = {
        getAllAndOverride: jest.fn(),
    };

    beforeEach(() => {
        reflector = mockReflector as any;
        guard = new RolesGuard(reflector);
    });

    const createMockContext = (user: any, handler = {}, controller = {}) => ({
        switchToHttp: () => ({
            getRequest: () => ({ user }),
        }),
        getHandler: () => handler,
        getClass: () => controller,
    } as ExecutionContext);

    it('should allow access when no roles are required', () => {
        // Arrange
        mockReflector.getAllAndOverride.mockReturnValue(null);
        const context = createMockContext({ role: UserRole.USER });

        // Act
        const result = guard.canActivate(context);

        // Assert
        expect(result).toBe(true);
    });

    it('should allow access when user has required role', () => {
        // Arrange
        mockReflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
        const context = createMockContext({ role: UserRole.ADMIN });

        // Act
        const result = guard.canActivate(context);

        // Assert
        expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user does not have required role', () => {
        // Arrange
        mockReflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
        const context = createMockContext({ role: UserRole.USER });

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is not authenticated', () => {
        // Arrange
        mockReflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
        const context = createMockContext(null);

        // Act & Assert
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
});