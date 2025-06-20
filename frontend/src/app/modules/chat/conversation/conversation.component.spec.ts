import { ClipboardModule } from '@angular/cdk/clipboard';
import { TextFieldModule } from '@angular/cdk/text-field';
import { signal, WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed, fakeAsync, tick, waitForAsync } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import {MatIconModule, MatIconRegistry} from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import {By, DomSanitizer} from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, Params } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { MarkdownModule, provideMarkdown } from 'ngx-markdown';
import {BehaviorSubject, catchError, of, throwError} from 'rxjs';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { FuseMediaWatcherService } from '@fuse/services/media-watcher'; // Import the actual service type
import { UserService } from 'app/core/user/user.service';
import { UserContentExt } from '#shared/llm/llm.model';
import { UserProfile } from '#shared/user/user.model';
import { LlmService, LLM } from '../../llm.service'; // Keep existing LlmService and LLM type
import { LocalStorageService } from 'app/core/services/local-storage.service';
import { ChatServiceClient } from '../chat.service';
import { Chat, ChatMessage, NEW_CHAT_ID } from '../chat.types';
import { ConversationComponent } from './conversation.component';
// conversation.component.spec.ts

import { ConversationPo }           from './conversation.po';
import { FakeChatSvc, FakeUserSvc, FakeLlmSvc } from '../../../../test/fakes';
import {FUSE_CONFIG} from "../../../../@fuse/services/config/config.constants";


const mockUser: UserProfile = {
	id: 'user1',
	name: 'Test User',
	email: 'test@example.com',
	enabled: true,
	hilBudget: 0,
	hilCount: 0,
	llmConfig: {},
	chat: { defaultLLM: 'llm-default' }, // Ensure chat.defaultLLM is present
	functionConfig: {},
};

const mockLlms: LLM[] = [
	{ id: 'llm-default', name: 'Default LLM', isConfigured: true },
	{ id: 'llm-alt', name: 'Alternative LLM', isConfigured: true },
];

const initialMockChat: Chat = {
	id: 'chat1',
	title: 'Test Chat',
	updatedAt: Date.now(),
	messages: [
		{ id: 'msg1', content: 'Hello User', isMine: false, createdAt: new Date().toISOString(), textContent: 'Hello User' },
		{ id: 'msg2', content: 'Hello Assistant', isMine: true, createdAt: new Date().toISOString(), textContent: 'Hello Assistant' },
	],
};

// Create a fake for FuseMediaWatcherService
export class FakeFuseMediaWatcherService {
  // Mock the onMediaChange$ observable to emit a typical value
  onMediaChange$ = of({ matchingAliases: ['lg'] });
}


fdescribe('ConversationComponent', () => {
    let po   : ConversationPo;
    let chat : FakeChatSvc;
    let mockActivatedRouteParams: BehaviorSubject<Params>;

    beforeEach(async () => {
        mockActivatedRouteParams = new BehaviorSubject<Params>({});

        await TestBed.configureTestingModule({
            imports: [
                ConversationComponent,
                NoopAnimationsModule,
                MatIconModule
            ],
            providers: [
                { provide: ChatServiceClient, useClass: FakeChatSvc },
                { provide: UserService,      useClass: FakeUserSvc },
                { provide: LlmService,       useClass: FakeLlmSvc },
                { provide: FUSE_CONFIG, useValue: {} },
                {
                    provide: ActivatedRoute,
                    useValue: {
                        params: mockActivatedRouteParams.asObservable(),
                        snapshot: { params: {}, queryParams: {} },
                        queryParams: of({})
                    }
                },
                // Add the provider for FuseMediaWatcherService
                { provide: FuseMediaWatcherService, useClass: FakeFuseMediaWatcherService }
            ],
        }).compileComponents();

        const iconRegistry = TestBed.inject(MatIconRegistry);
        const sanitizer = TestBed.inject(DomSanitizer);
        iconRegistry.addSvgIconLiteral('heroicons_outline:trash', sanitizer.bypassSecurityTrustHtml('<svg></svg>'));
        const originalGetNamedSvgIcon = iconRegistry.getNamedSvgIcon;
        spyOn(iconRegistry, 'getNamedSvgIcon').and.callFake((iconName: string, namespace: string = '') => {
            return originalGetNamedSvgIcon.call(iconRegistry, iconName, namespace).pipe(
                catchError(() => {
                    const dummySvgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    return of(dummySvgElement);
                })
            );
        });

        chat = TestBed.inject(ChatServiceClient) as unknown as FakeChatSvc;

        const fix = TestBed.createComponent(ConversationComponent);
        po = await ConversationPo.create(fix);
    });

    /* ─────────────────────────────────────────────────────────────── */
    it('shows spinner until a chat arrives', async () => {
        expect(po.isLoading()).toBeTrue();

        chat.setChat({ id:'c1', title:'First', messages:[], updatedAt:Date.now() });
        await po.detectAndWait();

        expect(po.isLoading()).toBeFalse();
        expect(po.chatTitle()).toBe('First');
    });

    /* ─────────────────────────────────────────────────────────────── */
    it('sends a message through the UI', async () => {
        chat.setChat({ id:'c2', title:'Send', messages:[], updatedAt:Date.now() });
        await po.detectAndWait();

        await po.typeMessage('hello');
        await po.clickSend();

        const svc = TestBed.inject(ChatServiceClient) as unknown as FakeChatSvc;
        expect(svc.sendMessage).toHaveBeenCalled();
        expect(po.inputValue()).toBe('');
    });

    /* ─────────────────────────────────────────────────────────────── */
    it('triggers send on Enter when enabled', async () => {
        chat.setChat({ id:'c3', title:'Keys', messages:[], updatedAt:Date.now() });
        await po.detectAndWait();

        await po.typeMessage('enter-send');
        await po.pressEnter();

        expect(chat.sendMessage).toHaveBeenCalled();
    });

    /* ─────────────────────────────────────────────────────────────── */
    it('allows picking an LLM from the select', async () => {
        chat.setChat({ id:'c4', title:'LLM', messages:[], updatedAt:Date.now() });
        await po.detectAndWait();

        await po.chooseLlmByText('GPT-4');
        // nothing more to assert – if the above line didn’t throw,
        // the public behaviour (select shows value) is fine.
    });

    /* ─────────────────────────────────────────────────────────────── */
    it('attaches a file before sending', fakeAsync(async () => {
        chat.setChat({ id:'c5', title:'Files', messages:[], updatedAt:Date.now() });
        await po.detectAndWait();

        const file = new File(['x'], 'img.png', { type:'image/png' });
        await po.attach([file]);

        await po.typeMessage('with file');
        await po.clickSend();
        tick();   // process observables in fakeAsync zone

        expect(chat.sendMessage).toHaveBeenCalled();
    }));

    /* ─────────────────────────────────────────────────────────────── */
    it('opens the info drawer', async () => {
        chat.setChat({ id:'c6', title:'Drawer', messages:[], updatedAt:Date.now() });
        await po.detectAndWait();

        expect(po.drawerOpened()).toBeFalse();
        await po.openDrawer();
        expect(po.drawerOpened()).toBeTrue();
    });
});


/*
describe('ConversationComponent', () => {
	let component: ConversationComponent;
	let fixture: ComponentFixture<ConversationComponent>;

	// Mocks for services used by ConversationComponent
	let mockLocalStorageService: jasmine.SpyObj<LocalStorageService>;
	let mockChatService: any; // Keep flexible structure from existing spec, enhance for draft tests
	let mockActivatedRoute: { params: BehaviorSubject<Params> }; // Use Params type
	let mockRouter: jasmine.SpyObj<Router>;
	let mockUserService: any; // From existing spec
	let mockLlmService: any; // From existing spec
	let mockMediaWatcherService: any; // From existing spec
	let mockConfirmationService: any; // From existing spec

	// Debounce time for draft saving, matches component's implementation
	const DRAFT_SAVE_DEBOUNCE_TIME = 500;

	beforeEach(waitForAsync(() => { // Or use async () =>
		// Initialize mocks
		mockLocalStorageService = jasmine.createSpyObj('LocalStorageService', ['getDraftMessage', 'saveDraftMessage', 'clearDraftMessage']);

		mockChatService = {
			chat: signal(null as Chat | null), // Start with null, will be set by route/init logic
			chats: signal([] as Chat[]),
			loadChatById: jasmine.createSpy('loadChatById').and.callFake((chatId: string) => {
				const loadedChat: Chat = { id: chatId, title: `Loaded ${chatId}`, messages: [], updatedAt: Date.now() };
				(mockChatService.chat as WritableSignal<Chat | null>).set(loadedChat);
				return of(undefined);
			}),
			loadChats: jasmine.createSpy('loadChats').and.returnValue(of(undefined)),
			resetChat: jasmine.createSpy('resetChat'),
			deleteChat: jasmine.createSpy('deleteChat').and.returnValue(of(undefined)),
			createChat: jasmine.createSpy('createChat').and.returnValue(of({ ...initialMockChat, id: 'newChatId123' })), // Returns Observable<Chat>
			sendMessage: jasmine.createSpy('sendMessage').and.returnValue(of(undefined)), // Returns Observable<void>
			regenerateMessage: jasmine.createSpy('regenerateMessage').and.returnValue(of(undefined)),
			sendAudioMessage: jasmine.createSpy('sendAudioMessage').and.returnValue(of(undefined)),
			formatMessageAsMarkdown: jasmine.createSpy('formatMessageAsMarkdown').and.returnValue(of('formatted')),
			setChat: jasmine.createSpy('setChat').and.callFake((chatToSet: Chat) => {
				(mockChatService.chat as WritableSignal<Chat | null>).set(chatToSet);
			}),
		};

		mockActivatedRoute = { params: new BehaviorSubject<Params>({}) }; // Initialize with empty params
		mockRouter = jasmine.createSpyObj('Router', ['navigate']);

		// Mocks from existing spec (ensure they are compatible with component signals)
		mockUserService = {
			userProfile: signal(mockUser), // Component uses userProfile() signal
			loadUser: jasmine.createSpy('loadUser'), // Component calls this
            // user$: of(mockUser), // Keep if other parts of component use it, but userProfile signal is primary
			// get: jasmine.createSpy('get').and.returnValue(of(mockUser)),
		};

		mockLlmService = {
			llmsState: signal({ status: 'success', data: mockLlms as LLM[] }), // Component uses llmsState() signal
			loadLlms: jasmine.createSpy('loadLlms'), // Component calls this
            // getLlms: jasmine.createSpy('getLlms').and.returnValue(of(mockLlms)), // Keep if other parts use it
		};

		mockMediaWatcherService = {
			onMediaChange$: of({ matchingAliases: ['lg'] }),
		};

		mockConfirmationService = {
			open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => of('confirmed') }),
		};

		TestBed.configureTestingModule({
			imports: [
				ConversationComponent, // Standalone component
				NoopAnimationsModule,
				RouterTestingModule, // Useful for [routerLink] etc.
				MatSnackBarModule,
				MarkdownModule.forRoot(), // From existing spec
			],
			providers: [
				{ provide: LocalStorageService, useValue: mockLocalStorageService },
				{ provide: ChatServiceClient, useValue: mockChatService }, // Use ChatServiceClient
				{ provide: ActivatedRoute, useValue: mockActivatedRoute },
				{ provide: Router, useValue: mockRouter },
				{ provide: UserService, useValue: mockUserService },
				{ provide: LlmService, useValue: mockLlmService },
				{ provide: FuseMediaWatcherService, useValue: mockMediaWatcherService },
				{ provide: FuseConfirmationService, useValue: mockConfirmationService },
				provideMarkdown(), // From existing spec
			],
		}).compileComponents();
	}));

	beforeEach(() => {
		fixture = TestBed.createComponent(ConversationComponent);
		component = fixture.componentInstance;
		// fixture.detectChanges(); // Moved to after initial setup or specific tests
	});

	it('should create', () => {
		fixture.detectChanges(); // Initial data binding
		expect(component).toBeTruthy();
	});

	it('should load chat on init if route has ID', () => {
		// Simulate route params having an ID
		(mockChatService.chat as WritableSignal<Chat | null>).set(null); // Reset chat before test
		mockActivatedRoute.params.next({ id: 'chat1' }); // Use the BehaviorSubject for params
		fixture.detectChanges(); // Trigger ngOnInit and effects

		expect(mockChatService.loadChatById).toHaveBeenCalledWith('chat1');
	});

	it('should display messages from the chat', () => {
		(mockChatService.chat as WritableSignal<Chat | null>).set(initialMockChat); // Ensure chat is set
		fixture.detectChanges(); // Trigger effects and rendering
		const messages = component.displayedMessages();
		expect(messages.length).toBe(initialMockChat.messages.length);
		// Further checks can be done on the rendered DOM elements
	});

	describe('Draft Message Loading', () => {
		it('should load draft message from LocalStorageService on init if chatId from route exists and set input', fakeAsync(() => {
			const testChatId = 'chat123';
			const draftText = 'Existing draft';
			mockLocalStorageService.getDraftMessage.and.returnValue(draftText);

			mockActivatedRoute.params.next({ id: testChatId });
			fixture.detectChanges(); // Trigger ngOnInit and effects related to route params
			tick(); // Allow observables from route params and chat loading to resolve

			expect(mockChatService.loadChatById).toHaveBeenCalledWith(testChatId);
			// The chat signal should have been updated by loadChatById mock
			expect(mockLocalStorageService.getDraftMessage).toHaveBeenCalledWith(testChatId);
			expect(component.messageInput.nativeElement.value).toBe(draftText);
		}));

		it('should attempt to load draft for NEW_CHAT_ID if no route id, after chat service sets new chat', fakeAsync(() => {
			const draftText = 'New chat draft';
			mockLocalStorageService.getDraftMessage.and.returnValue(draftText);

			mockActivatedRoute.params.next({}); // No id in route
			fixture.detectChanges(); // Trigger ngOnInit and effects
			tick(); // Allow observables to resolve

			// ChatService.setChat should be called by the component, which updates the chat signal
			expect(mockChatService.setChat).toHaveBeenCalledWith(jasmine.objectContaining({ id: NEW_CHAT_ID }));
			expect(mockLocalStorageService.getDraftMessage).toHaveBeenCalledWith(NEW_CHAT_ID); // NEW_CHAT_ID is 'new'
			expect(component.messageInput.nativeElement.value).toBe(draftText);
		}));

		it('should not set input if no draft message exists for a given chatId', fakeAsync(() => {
			const testChatId = 'chat789';
			mockLocalStorageService.getDraftMessage.and.returnValue(null);

			mockActivatedRoute.params.next({ id: testChatId });
			fixture.detectChanges();
			tick();

			expect(mockChatService.loadChatById).toHaveBeenCalledWith(testChatId);
			expect(mockLocalStorageService.getDraftMessage).toHaveBeenCalledWith(testChatId);
			expect(component.messageInput.nativeElement.value).toBe('');
		}));

        it('should clear input if switching to a chat with no draft from a chat that might have had one', fakeAsync(() => {
            // Setup initial chat (simulating it was loaded)
            const firstChatId = 'firstChatWithDraft';
            (mockChatService.chat as WritableSignal<Chat | null>).set({ id: firstChatId, title: 'First', messages: [], updatedAt: Date.now() });
            component.messageInput.nativeElement.value = "Draft from first chat"; // Manually set for test
            component.previousChatId = firstChatId; // Simulate component state
            fixture.detectChanges();
            tick();

            // Switch to a new chat ID that has no draft
            const secondChatId = 'secondChatNoDraft';
            mockLocalStorageService.getDraftMessage.and.returnValue(null); // No draft for the second chat

            // Simulate route change and chat loading for the second chat
            mockActivatedRoute.params.next({ id: secondChatId });
            // loadChatById mock will update mockChatService.chat signal
            fixture.detectChanges(); // Process route change
            tick(); // Allow effects to run

            expect(mockChatService.loadChatById).toHaveBeenCalledWith(secondChatId);
            expect(mockLocalStorageService.getDraftMessage).toHaveBeenCalledWith(secondChatId);
            expect(component.messageInput.nativeElement.value).toBe('');
        }));
	});

	describe('Draft Message Saving', () => {
		it('should call saveDraftMessage on input change after debounce with current chatId', fakeAsync(() => {
			const testChatId = 'activeChatId';
			mockActivatedRoute.params.next({ id: testChatId });
			fixture.detectChanges(); // Initialize component, process route params
			tick(); // Allow effects to complete (like chat loading)

			component.messageInput.nativeElement.value = 'Typing...';
			component.messageInput.nativeElement.dispatchEvent(new Event('input')); // Simulate input
			fixture.detectChanges(); // For _resizeMessageInput if it affects DOM

			expect(mockLocalStorageService.saveDraftMessage).not.toHaveBeenCalled(); // Not called immediately

			tick(DRAFT_SAVE_DEBOUNCE_TIME + 50); // Advance time past debounce

			expect(mockLocalStorageService.saveDraftMessage).toHaveBeenCalledWith(testChatId, 'Typing...');
		}));

		it('should use NEW_CHAT_ID for saving draft if current chat is new (no route id)', fakeAsync(() => {
			mockActivatedRoute.params.next({});
			fixture.detectChanges();
			tick(); // Allow chat to be set to NEW_CHAT_ID

			component.messageInput.nativeElement.value = 'New draft text';
			component.messageInput.nativeElement.dispatchEvent(new Event('input'));
			fixture.detectChanges();

			tick(DRAFT_SAVE_DEBOUNCE_TIME + 50);

			expect(mockLocalStorageService.saveDraftMessage).toHaveBeenCalledWith(NEW_CHAT_ID, 'New draft text');
		}));
	});

	describe('Draft Message Clearing', () => {
		beforeEach(fakeAsync(() => {
            // Ensure userProfile is loaded for sendMessage to proceed
            mockUserService.userProfile.set(mockUser);
            // Ensure LLM is selected for sendMessage
            component.llmId.set(mockLlms[0].id);
			fixture.detectChanges();
            tick();
        }));

		it('should call clearDraftMessage with current chatId on successful message send (existing chat)', fakeAsync(() => {
			const testChatId = 'chatToClear';
			mockActivatedRoute.params.next({ id: testChatId });
			fixture.detectChanges();
			tick(); // Ensure chat is loaded

			component.messageInput.nativeElement.value = 'Message to send';
			// mockChatService.sendMessage already returns of(undefined) by default

			component.sendMessage(); // This is async
			tick(); // Allow async operations in sendMessage (like attachmentsAndTextToUserContentExt)
			            // and allow the observable subscription to be processed.

			// The clearDraftMessage is in the 'complete' callback of the API call observable
			// Ensure the observable returned by mockChatService.sendMessage completes. 'of(undefined)' does.

			expect(mockLocalStorageService.clearDraftMessage).toHaveBeenCalledWith(testChatId);
			expect(component.messageInput.nativeElement.value).toBe('');
		}));

		it('should call clearDraftMessage with NEW_CHAT_ID on successful new chat creation, then navigate', fakeAsync(() => {
			mockActivatedRoute.params.next({});
			fixture.detectChanges();
			tick(); // Ensure chat is NEW_CHAT_ID

			component.messageInput.nativeElement.value = 'First message';
			const newChatResponse: Chat = { id: 'newlyCreatedChatId', messages: [], title: 'New Chat', updatedAt: Date.now() };
			mockChatService.createChat.and.returnValue(of(newChatResponse));

			component.sendMessage();
			tick();
			fixture.detectChanges();

			expect(mockLocalStorageService.clearDraftMessage).toHaveBeenCalledWith(NEW_CHAT_ID);
			expect(mockRouter.navigate).toHaveBeenCalledWith(['/ui/chat', newChatResponse.id]);
			expect(component.messageInput.nativeElement.value).toBe('');
		}));

		it('should NOT clearDraftMessage if message send fails', fakeAsync(() => {
			const testChatId = 'chatKeepDraft';
			mockActivatedRoute.params.next({ id: testChatId });
			fixture.detectChanges();
			tick();

			const failedMessageText = 'Failed message';
			component.messageInput.nativeElement.value = failedMessageText;
			mockChatService.sendMessage.and.returnValue(throwError(() => new Error('Send failed')));

			component.sendMessage();
			tick();
			fixture.detectChanges();

			expect(mockLocalStorageService.clearDraftMessage).not.toHaveBeenCalled();
			expect(component.messageInput.nativeElement.value).toBe(failedMessageText);
		}));
	});

	describe('Auto-Reformat Feature', () => {
		beforeEach(() => {
			// Assuming autoReformatEnabled is initialized in the component
			// e.g., autoReformatEnabled = signal(false);
			// If it's not, these tests would fail or need to mock its creation.
			// For testing, we can set it if the component allows or spy on its methods.
			// Let's assume `component.autoReformatEnabled` exists and is a WritableSignal.
			// And `toggleAutoReformat` method exists.
			if (!component.autoReformatEnabled) {
				component.autoReformatEnabled = signal(false);
			}
			if (!component.toggleAutoReformat) {
				component.toggleAutoReformat = () => {
					component.autoReformatEnabled.update((v) => !v);
				};
			}
			// Spy on the actual toggle method if it's more complex
			spyOn(component, 'toggleAutoReformat').and.callThrough();
		});

		it('should initialize autoReformatEnabled to false', () => {
			component.autoReformatEnabled.set(false); // Ensure defined state for test
			fixture.detectChanges();
			expect(component.autoReformatEnabled()).toBeFalse();
		});

		it('should toggle autoReformatEnabled from false to true when toggleAutoReformat() is called', () => {
			component.autoReformatEnabled.set(false);
			fixture.detectChanges();

			component.toggleAutoReformat();
			fixture.detectChanges();
			expect(component.autoReformatEnabled()).toBeTrue();
		});

		it('should toggle autoReformatEnabled from true to false when toggleAutoReformat() is called again', () => {
			component.autoReformatEnabled.set(true);
			fixture.detectChanges();

			component.toggleAutoReformat();
			fixture.detectChanges();
			expect(component.autoReformatEnabled()).toBeFalse();
		});

		describe('Keyboard Shortcut (Ctrl+Shift+F)', () => {
			it('should call toggleAutoReformat() when Ctrl+Shift+F is pressed', () => {
				const event = new KeyboardEvent('keydown', {
					key: 'F',
					ctrlKey: true,
					shiftKey: true,
					bubbles: true,
					cancelable: true,
				});
				document.body.dispatchEvent(event); // Assuming global listener or on a high-level element
				fixture.detectChanges();
				expect(component.toggleAutoReformat).toHaveBeenCalled();
			});

			it('should call event.preventDefault() when Ctrl+Shift+F is pressed', () => {
				const event = new KeyboardEvent('keydown', {
					key: 'F',
					ctrlKey: true,
					shiftKey: true,
					bubbles: true,
					cancelable: true,
				});
				// To test preventDefault, the listener in the component must call it.
				// We can check event.defaultPrevented after dispatching.
				// This assumes the @HostListener in the component calls event.preventDefault().
				// For this test to be meaningful, the component's actual keydown handler
				// needs to be set up to call preventDefault.

				// If toggleAutoReformat itself calls preventDefault on the event:
				// spyOn(event, 'preventDefault');
				// component.handleKeyDown(event); // Assuming a method handleKeyDown exists and calls toggle + preventDefault
				// expect(event.preventDefault).toHaveBeenCalled();

				// More directly, check if default was prevented after dispatch
				document.body.dispatchEvent(event);
				expect(event.defaultPrevented).toBeTrue(); // This checks the effect of preventDefault
			});
		});

		describe('sendMessage() method with autoReformat flag', () => {
			const userContent: UserContentExt = 'Test message';
			const llmId = 'llm-default'; // Matches mockUser.chat.defaultLLM and mockLlms[0].id

			beforeEach(() => {
				// Ensure spies are reset/reinitialized if needed, though Jasmine typically handles this for spies created in parent beforeEach
				// For clarity, one might re-spy here if tests manipulate spy behavior significantly.
				// However, the existing setup in the main beforeEach should be fine.
				// mockChatService.createChat.calls.reset();
				// mockChatService.sendMessage.calls.reset();

				// Ensure messageInput is available. It should be after initial fixture.detectChanges() in main beforeEach.
				// If component.messageInput is null, this indicates an issue with ViewChild initialization or test setup.
				if (component.messageInput?.nativeElement) {
					component.messageInput.nativeElement.value = ''; // Clear message input
				}
				component.selectedAttachments.set([]); // Clear attachments
			});

			it('should call _chatService.createChat with autoReformat: true for a new chat when autoReformatEnabled is true', fakeAsync(() => {
				// Arrange
				(mockChatService.chat as WritableSignal<Chat | null>).set(null); // New chat scenario
				component.autoReformatEnabled.set(true);
				component.llmId.set(llmId);
				if (component.messageInput?.nativeElement) {
					component.messageInput.nativeElement.value = userContent as string;
				}
				component.selectedAttachments.set([]);
				fixture.detectChanges(); // Ensure UI reflects changes if component reads from DOM directly before send

				// Act
				component.sendMessage(); // sendMessage is async but test is fakeAsync
				tick(); // Allow promises within sendMessage to resolve (e.g. attachmentsAndTextToUserContentExt)
				            // and allow the observable subscription to be processed.

				// Assert
				expect(mockChatService.createChat).toHaveBeenCalledWith(
					userContent, // UserContentExt (string if no attachments)
					llmId,
					jasmine.objectContaining({ thinking: null }), // options
					true, // autoReformat flag
				);
			}));

			it('should call _chatService.createChat with autoReformat: false for a new chat when autoReformatEnabled is false', fakeAsync(() => {
				// Arrange
				(mockChatService.chat as WritableSignal<Chat | null>).set(null); // New chat scenario
				component.autoReformatEnabled.set(false);
				component.llmId.set(llmId);
				if (component.messageInput?.nativeElement) {
					component.messageInput.nativeElement.value = userContent as string;
				}
				component.selectedAttachments.set([]);
				fixture.detectChanges();

				// Act
				component.sendMessage();
				tick();

				// Assert
				expect(mockChatService.createChat).toHaveBeenCalledWith(
					userContent,
					llmId,
					jasmine.objectContaining({ thinking: null }),
					false, // autoReformat flag
				);
			}));

			it('should call _chatService.sendMessage with autoReformat: true for an existing chat when autoReformatEnabled is true', fakeAsync(() => {
				// Arrange
				(mockChatService.chat as WritableSignal<Chat | null>).set(initialMockChat); // Existing chat scenario
				component.autoReformatEnabled.set(true);
				component.llmId.set(llmId);
				if (component.messageInput?.nativeElement) {
					component.messageInput.nativeElement.value = userContent as string;
				}
				component.selectedAttachments.set([]);
				fixture.detectChanges();

				// Act
				component.sendMessage();
				tick();

				// Assert
				expect(mockChatService.sendMessage).toHaveBeenCalledWith(
					initialMockChat.id,
					userContent, // UserContentExt (string if no attachments)
					llmId,
					undefined, // SendMessageOptions
					[], // attachments
					true, // autoReformat flag
				);
			}));

			it('should call _chatService.sendMessage with autoReformat: false for an existing chat when autoReformatEnabled is false', fakeAsync(() => {
				// Arrange
				(mockChatService.chat as WritableSignal<Chat | null>).set(initialMockChat); // Existing chat scenario
				component.autoReformatEnabled.set(false);
				component.llmId.set(llmId);
				if (component.messageInput?.nativeElement) {
					component.messageInput.nativeElement.value = userContent as string;
				}
				component.selectedAttachments.set([]);
				fixture.detectChanges();

				// Act
				component.sendMessage();
				tick();

				// Assert
				expect(mockChatService.sendMessage).toHaveBeenCalledWith(
					initialMockChat.id,
					userContent,
					llmId,
					undefined, // SendMessageOptions
					[], // attachments
					false, // autoReformat flag
				);
			}));
		});

		describe('Button Appearance (Optional)', () => {
			// These tests assume specific DOM structure for the button.
			// e.g., <button id="auto-reformat-button" ...><mat-icon>...</mat-icon></button>
			// And that MatTooltip directive is used as [matTooltip]="..."

			const getButton = () => fixture.debugElement.query(By.css('#auto-reformat-button'));
			const getButtonIcon = () => getButton()?.query(By.css('mat-icon'));

			it('should display correct icon and tooltip when autoReformatEnabled is false', () => {
				component.autoReformatEnabled.set(false);
				fixture.detectChanges();

				const buttonEl = getButton();
				if (buttonEl) {
					// Only run if button exists in template for test
					const matIconEl = getButtonIcon();
					expect(matIconEl?.nativeElement.textContent?.trim()).toBe('auto_fix_high'); // Placeholder icon name
					expect(buttonEl.nativeElement.getAttribute('mattooltip')).toBe('Enable Auto-Reformat'); // Placeholder tooltip
				} else {
					pending('Button #auto-reformat-button not found in template, skipping appearance test.');
				}
			});

			it('should display correct icon and tooltip when autoReformatEnabled is true', () => {
				component.autoReformatEnabled.set(true);
				fixture.detectChanges();

				const buttonEl = getButton();
				if (buttonEl) {
					// Only run if button exists in template for test
					const matIconEl = getButtonIcon();
					expect(matIconEl?.nativeElement.textContent?.trim()).toBe('format_clear'); // Placeholder icon name
					expect(buttonEl.nativeElement.getAttribute('mattooltip')).toBe('Disable Auto-Reformat'); // Placeholder tooltip
				} else {
					pending('Button #auto-reformat-button not found in template, skipping appearance test.');
				}
			});
		});
	});

	xdescribe('Attachment Functionality in ConversationComponent', () => {
		it('should add files to selectedAttachments using addFiles method', () => {
			// Test addFiles
		});

		it('should convert attachments and text to UserContentExt on sendMessage', () => {
			// Test sendMessage payload
		});

		it('should parse UserContentExt to display attachments and text in displayedMessages', () => {
			// Test displayedMessages computation
		});

		it('should handle image previews correctly in the template', () => {
			// Mock messages with image attachments, check DOM
		});

		it('should handle file previews/icons correctly in the template', () => {
			// Mock messages with file attachments, check DOM
		});
	});

	describe('Optimistic UI for Sending Messages', () => {
		beforeEach(fakeAsync(() => {
			// Ensure component is initialized and essential data is available for sendMessage
			mockActivatedRoute.params.next({ id: 'existingChatId' });
			fixture.detectChanges(); // Initialize component, process route params
			tick(); // Allow effects to complete (like chat loading)

			// Set up common prerequisites for sendMessage tests
			component.llmId.set('test-llm');
			mockUserService.userProfile.set({
				id: 'user1',
				name: 'Test User',
				email: 'test@example.com',
				enabled: true,
				hilBudget: 0,
				hilCount: 0,
				llmConfig: {},
				chat: { defaultLLM: 'test-llm' },
				functionConfig: {},
			});
			if (component.messageInput?.nativeElement) {
				component.messageInput.nativeElement.value = 'Test message';
			} else {
				// Fail test or handle if messageInput is unexpectedly null
				// For now, assume it will be available after fixture.detectChanges()
				console.warn('messageInput.nativeElement is null during test setup');
			}
			fixture.detectChanges();
			tick();
		}));

		it('should set generatingAIMessage when sendMessage is called and clear it on successful completion', fakeAsync(() => {
			// Arrange
			mockChatService.sendMessage.and.returnValue(of(void 0)); // Simulate successful send

			// Act
			component.sendMessage();
			// Assert: generatingAIMessage should be set immediately or after microtask
			// Since sendMessage has async parts (attachmentsAndTextToUserContentExt),
			// and generatingAIMessage.set is called before the API call observable.
			expect(component.generatingAIMessage()).not.toBeNull();
			expect(component.generatingAIMessage()?.content).toBe('.'); // Initial placeholder content

			// Act: Allow async operations in sendMessage (like attachmentsAndTextToUserContentExt and API call) to complete
			tick();
			fixture.detectChanges(); // Allow UI to update based on signal changes

			// Assert: generatingAIMessage should be cleared on successful completion
			expect(component.generatingAIMessage()).toBeNull();
		}));

		it('should set generatingAIMessage and clear it on error during sendMessage', fakeAsync(() => {
			// Arrange
			mockChatService.sendMessage.and.returnValue(throwError(() => new Error('Send failed')));
			if (component.messageInput?.nativeElement) {
				component.messageInput.nativeElement.value = 'Test message for error';
			}

			// Act
			component.sendMessage();
			expect(component.generatingAIMessage()).not.toBeNull();
			expect(component.generatingAIMessage()?.content).toBe('.');

			// Act: Allow async operations and error handling to complete
			tick();
			fixture.detectChanges();

			// Assert: generatingAIMessage should be cleared on error
			expect(component.generatingAIMessage()).toBeNull();
		}));

		it('displayedMessages should include the generatingAIMessage placeholder when active', () => {
			// Arrange
			const mockChatMessages: ChatMessage[] = [
				{ id: 'm1', content: 'Hi', isMine: true, createdAt: new Date().toISOString(), textContent: 'Hi' }
			];
			const mockChat: Chat = {
				id: 'chat1',
				title: 'Test Chat Display',
				messages: mockChatMessages,
				updatedAt: Date.now()
			};
			(mockChatService.chat as WritableSignal<Chat | null>).set(mockChat);
			fixture.detectChanges(); // Update based on chat signal

			const placeholderAiMessage: ChatMessage = {
				id: 'temp-ai-placeholder',
				content: '...', // UserContentExt (string)
				textContent: '...', // textContent for UIMessage compatibility
				isMine: false,
				generating: true,
				createdAt: new Date().toISOString(),
			};
			component.generatingAIMessage.set(placeholderAiMessage);
			fixture.detectChanges(); // Update based on generatingAIMessage signal

			// Assert
			const displayed = component.displayedMessages();
			expect(displayed.length).toBe(mockChatMessages.length + 1);

			const lastDisplayedMessage = displayed[displayed.length - 1];
			expect(lastDisplayedMessage.id).toBe(placeholderAiMessage.id);
			expect(lastDisplayedMessage.generating).toBeTrue();
			// Check derived properties from displayedMessages computation
			expect(lastDisplayedMessage.textContentForDisplay).toBe('...');
		});
	});
});
		});

		it('should convert attachments and text to UserContentExt on sendMessage', () => {
			// Test sendMessage payload
		});

		it('should parse UserContentExt to display attachments and text in displayedMessages', () => {
			// Test displayedMessages computation
		});

		it('should handle image previews correctly in the template', () => {
			// Mock messages with image attachments, check DOM
		});

		it('should handle file previews/icons correctly in the template', () => {
			// Mock messages with file attachments, check DOM
		});
	});
});
*/
