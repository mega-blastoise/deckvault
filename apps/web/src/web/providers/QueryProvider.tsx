/**
 * The module-level QueryClient singleton has been removed.
 * Per-request QueryClient creation is now handled by the DataLayer.
 * Use createQueryClient() from @/web/layers/data to create a new instance.
 */
export { createQueryClient } from '../layers/data';
