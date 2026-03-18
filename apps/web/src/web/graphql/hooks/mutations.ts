/**
 * REACT-QUERY HOOKS FOR GRAPHQL MUTATIONS
 *
 * Custom hooks that wrap GraphQL mutations with react-query for optimistic
 * updates, automatic cache invalidation, and loading/error states
 */

import {
  useMutation,
  type UseMutationOptions,
  useQueryClient
} from '@tanstack/react-query';
import { graphqlClient } from '../client';
import {
  CREATE_USER,
  UPDATE_USER,
  DELETE_USER,
  CREATE_SET,
  CREATE_CARD,
  DELETE_CARD
} from '../documents';
import type {
  User,
  Set,
  Card,
  CreateUserResponse,
  UpdateUserResponse,
  DeleteUserResponse,
  CreateSetResponse,
  CreateCardResponse,
  DeleteCardResponse,
  CreateUserVariables,
  UpdateUserVariables,
  DeleteUserVariables,
  CreateSetVariables,
  CreateCardVariables,
  DeleteCardVariables
} from '../types';

// ============================================================================
// USER MUTATION HOOKS
// ============================================================================

/**
 * Hook to create a new user
 * Automatically invalidates the users query cache on success
 */
export function useCreateUser(
  options?: Omit<
    UseMutationOptions<User, Error, CreateUserVariables>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation<User, Error, CreateUserVariables>({
    mutationFn: async (variables) => {
      const data = await graphqlClient.request<
        CreateUserResponse,
        CreateUserVariables
      >(CREATE_USER, variables);
      return data.createUser;
    },
    onSuccess: (data, variables, context) => {
      // Invalidate users list to refetch with new user
      queryClient.invalidateQueries({ queryKey: ['users'] });
      // Call user's onSuccess if provided
      options?.onSuccess?.(data, variables, context, undefined as never);
    },
    ...options
  });
}

/**
 * Hook to update an existing user
 * Automatically invalidates relevant query caches on success
 */
export function useUpdateUser(
  options?: Omit<
    UseMutationOptions<User | null, Error, UpdateUserVariables>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation<User | null, Error, UpdateUserVariables>({
    mutationFn: async (variables) => {
      const data = await graphqlClient.request<
        UpdateUserResponse,
        UpdateUserVariables
      >(UPDATE_USER, variables);
      return data.updateUser;
    },
    onSuccess: (data, variables, context) => {
      // Invalidate the specific user and users list
      queryClient.invalidateQueries({ queryKey: ['user', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      options?.onSuccess?.(data, variables, context, undefined as never);
    },
    ...options
  });
}

/**
 * Hook to delete a user
 * Automatically invalidates relevant query caches on success
 */
export function useDeleteUser(
  options?: Omit<
    UseMutationOptions<boolean, Error, DeleteUserVariables>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, DeleteUserVariables>({
    mutationFn: async (variables) => {
      const data = await graphqlClient.request<
        DeleteUserResponse,
        DeleteUserVariables
      >(DELETE_USER, variables);
      return data.deleteUser;
    },
    onSuccess: (data, variables, context) => {
      // Remove from cache and invalidate lists
      queryClient.removeQueries({ queryKey: ['user', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      options?.onSuccess?.(data, variables, context, undefined as never);
    },
    ...options
  });
}

// ============================================================================
// SET MUTATION HOOKS
// ============================================================================

/**
 * Hook to create a new set
 * Automatically invalidates the sets query cache on success
 */
export function useCreateSet(
  options?: Omit<
    UseMutationOptions<Set, Error, CreateSetVariables>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation<Set, Error, CreateSetVariables>({
    mutationFn: async (variables) => {
      const data = await graphqlClient.request<
        CreateSetResponse,
        CreateSetVariables
      >(CREATE_SET, variables);
      return data.createSet;
    },
    onSuccess: (data, variables, context) => {
      // Invalidate sets queries to include new set
      queryClient.invalidateQueries({ queryKey: ['sets'] });
      options?.onSuccess?.(data, variables, context, undefined as never);
    },
    ...options
  });
}

// ============================================================================
// CARD MUTATION HOOKS
// ============================================================================

/**
 * Hook to create a new card
 * Automatically invalidates relevant query caches on success
 */
export function useCreateCard(
  options?: Omit<
    UseMutationOptions<Card, Error, CreateCardVariables>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation<Card, Error, CreateCardVariables>({
    mutationFn: async (variables) => {
      const data = await graphqlClient.request<
        CreateCardResponse,
        CreateCardVariables
      >(CREATE_CARD, variables);
      return data.createCard;
    },
    onSuccess: (data, variables, context) => {
      // Invalidate cards queries and set-specific queries
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({
        queryKey: ['cards', 'set', variables.set_id]
      });
      options?.onSuccess?.(data, variables, context, undefined as never);
    },
    ...options
  });
}

/**
 * Hook to delete a card
 * Automatically invalidates relevant query caches on success
 */
export function useDeleteCard(
  options?: Omit<
    UseMutationOptions<boolean, Error, DeleteCardVariables>,
    'mutationFn'
  >
) {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, DeleteCardVariables>({
    mutationFn: async (variables) => {
      const data = await graphqlClient.request<
        DeleteCardResponse,
        DeleteCardVariables
      >(DELETE_CARD, variables);
      return data.deleteCard;
    },
    onSuccess: (data, variables, context) => {
      // Remove from cache and invalidate lists
      queryClient.removeQueries({ queryKey: ['card', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      options?.onSuccess?.(data, variables, context, undefined as never);
    },
    ...options
  });
}
