import React, { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/Auth';
import { useDeckQuery } from '../../hooks/useDeckQuery';
import { useDeckMutations } from '../../hooks/useDeckMutations';
import { QueryBoundary } from '../../components/QueryBoundary';
import { ROUTES } from '../../routes';
import { pipeline } from '../../utils/pipeline';
import { DeckDetailPageView } from './View';

function DeckDetailPageComponent() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const deckQuery = useDeckQuery(deckId);
  const { deleteMutation } = useDeckMutations();

  const handleDelete = useCallback(async () => {
    if (deckId) {
      await deleteMutation.mutateAsync(deckId);
      navigate(ROUTES.DECKS);
    }
  }, [deckId, deleteMutation, navigate]);

  const handleNavigateToCard = useCallback(
    (cardId: string) => navigate(ROUTES.CARD(cardId)),
    [navigate]
  );

  return (
    <QueryBoundary>
      <DeckDetailPageView
        deckQuery={deckQuery}
        deckId={deckId ?? ''}
        currentUserId={user?.id}
        onDelete={handleDelete}
        onNavigateToCard={handleNavigateToCard}
      />
    </QueryBoundary>
  );
}

export const DeckDetailPage = pipeline(React.memo)(DeckDetailPageComponent);
