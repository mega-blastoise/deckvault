import React, { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useCard } from '../../hooks/useCard';
import { useCollection } from '../../contexts/Collection';
import { QueryBoundary } from '../../components/QueryBoundary';
import { pipeline } from '../../utils/pipeline';
import { CardPageView } from './View';

function CardPageComponent() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();

  const cardQuery = useCard(cardId ?? '');
  const { getQuantity, addCard, removeCard } = useCollection();

  const handleNavigateBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  return (
    <QueryBoundary>
      <CardPageView
        cardQuery={cardQuery}
        getQuantity={getQuantity}
        onAddCard={addCard}
        onRemoveCard={removeCard}
        onNavigateBack={handleNavigateBack}
      />
    </QueryBoundary>
  );
}

export const CardPage = pipeline(React.memo)(CardPageComponent);
