"use client";

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

interface Message {
  id: string;
  conversation_id: string;
  user_id: string;
  question: string;
  response: string | null;
  created_at: string;
}

interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  shared: boolean;
}

const SharedChatPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get('c');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConversation = async () => {
      if (!conversationId) {
        setError('No conversation ID provided');
        setLoading(false);
        return;
      }

      try {
        // Fetch conversation details
        const convResponse = await axios.get(`/api/conversations/${conversationId}`);
        if (!convResponse.data.success) {
          throw new Error(convResponse.data.error || 'Failed to fetch conversation');
        }

        const fetchedConversation = convResponse.data.data;
        if (!fetchedConversation.shared) {
          throw new Error('This conversation is not shared');
        }

        setConversation(fetchedConversation);

        // Fetch conversation messages
        const msgResponse = await axios.get(`/api/conversations/${conversationId}/messages`);
        if (!msgResponse.data.success) {
          throw new Error(msgResponse.data.error || 'Failed to fetch messages');
        }

        setMessages(msgResponse.data.messages);
        setLoading(false);
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching the conversation');
        setLoading(false);
      }
    };

    fetchConversation();
  }, [conversationId]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!conversation) {
    return <div>No conversation found</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">{conversation.title}</h1>
      <div className="space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="border p-4 rounded-lg">
            <p className="font-semibold">Question:</p>
            <p>{message.question}</p>
            {message.response && (
              <>
                <p className="font-semibold mt-2">Response:</p>
                <p>{message.response}</p>
              </>
            )}
            <p className="text-sm text-gray-500 mt-2">
              {new Date(message.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SharedChatPage;