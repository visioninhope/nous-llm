export interface Profile {
    id?: string;
    name?: string;
    email?: string;
    avatar?: string;
    about?: string;
}

export interface Contact {
    id?: string;
    avatar?: string;
    name?: string;
    about?: string;
    details?: {
        emails?: {
            email?: string;
            label?: string;
        }[];
        phoneNumbers?: {
            country?: string;
            phoneNumber?: string;
            label?: string;
        }[];
        title?: string;
        company?: string;
        birthday?: string;
        address?: string;
    };
    attachments?: {
        media?: any[];
        docs?: any[];
        links?: any[];
    };
}

export interface LlmMessage {
    role: 'system' | 'user' | 'assistant';
    text: string;
    /** The LLM which generated the text (only when role=assistant) */
    llmId?: string;
    /** Set the cache_control flag with Claude models */
    cache?: 'ephemeral';
    time?: number;
}

export interface Chat {
    id: string;
    title: string;
    contactId?: string;
    contact?: Contact;
    unreadCount?: number;
    lastMessage?: string;
    lastMessageAt?: string;
    messages?: {
        id?: string;
        chatId?: string;
        contactId?: string;
        isMine?: boolean;
        value?: string;
        llmId?: string;
        createdAt?: string;
    }[];
}
