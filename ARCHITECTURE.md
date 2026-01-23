# Project Neural - System Architecture

## Architecture Diagram

```mermaid
graph TB
    subgraph "Frontend Layer (React)"
        App[App.jsx<br/>Main Application]
        Terminal[Terminal Component<br/>Command Interface]
        AIPanel[AIPanel Component<br/>AI Chat Interface]
        WorkflowRunner[WorkflowRunner Component<br/>Workflow Management]
        HistorySidebar[HistorySidebar Component<br/>Command History]
        Auth[Auth Components<br/>Login/Register]
        LearningPanel[LearningModePanel<br/>Command Explanations]
        SecurityModal[SecurityWarningModal<br/>Security Warnings]
    end

    subgraph "Tauri IPC Bridge"
        IPC[Tauri IPC<br/>Frontend ↔ Backend Communication]
    end

    subgraph "Backend Layer (Rust)"
        Commands[commands.rs<br/>Command Handlers<br/>- Authentication<br/>- NL to Command<br/>- Command Execution<br/>- AI Features<br/>- Workflows<br/>- History]
        
        subgraph "Core Modules"
            AI[ai.rs<br/>AI Integration<br/>- OpenAI API<br/>- Gemini API<br/>- Groq API<br/>- NL Processing<br/>- Error Analysis]
            Runner[runner.rs<br/>Command Execution<br/>- Process Management<br/>- Stream Handling<br/>- Output Capture]
            Context[context.rs<br/>Project Detection<br/>- Project Type<br/>- Package Detection<br/>- Script Extraction]
            Workflow[workflow.rs<br/>Workflow Engine<br/>- Step Execution<br/>- Error Handling<br/>- Progress Tracking]
            Redaction[redaction.rs<br/>Security Layer<br/>- Secret Redaction<br/>- Command Validation<br/>- Danger Detection]
        end
        
        Models[models.rs<br/>Data Structures<br/>- CommandHistory<br/>- Workflow<br/>- Context<br/>- AI Responses]
    end

    subgraph "Data Layer"
        DB[(SQLite Database<br/>neural.db)]
        Tables[Database Tables<br/>- commands_history<br/>- ai_suggestions<br/>- workflows<br/>- preferences<br/>- users]
    end

    subgraph "External Services"
        OpenAI[OpenAI API<br/>GPT Models]
        Gemini[Google Gemini API<br/>Gemini Models]
        Groq[Groq API<br/>Fast Inference]
    end

    subgraph "System Integration"
        Shell[OS Shell<br/>PowerShell/Bash/Zsh]
        FileSystem[File System<br/>Project Files]
    end

    %% Frontend connections
    App --> Terminal
    App --> AIPanel
    App --> WorkflowRunner
    App --> HistorySidebar
    App --> Auth
    Terminal --> LearningPanel
    Terminal --> SecurityModal

    %% Frontend to IPC
    Terminal --> IPC
    AIPanel --> IPC
    WorkflowRunner --> IPC
    HistorySidebar --> IPC
    Auth --> IPC

    %% IPC to Backend
    IPC --> Commands

    %% Backend module connections
    Commands --> AI
    Commands --> Runner
    Commands --> Context
    Commands --> Workflow
    Commands --> Redaction
    Commands --> Models
    Commands --> DB

    AI --> Models
    Runner --> Models
    Context --> Models
    Workflow --> Models
    Workflow --> Runner
    Redaction --> Models

    %% Database connections
    Commands --> Tables
    Tables --> DB

    %% External service connections
    AI --> OpenAI
    AI --> Gemini
    AI --> Groq

    %% System integration
    Runner --> Shell
    Context --> FileSystem
    Workflow --> Shell

    %% Data flow annotations
    Terminal -.NL Input.-> IPC
    IPC -.NL Request.-> Commands
    Commands -.-> AI
    AI -.API Call.-> OpenAI
    AI -.API Call.-> Gemini
    AI -.API Call.-> Groq
    AI -.Command Response.-> Commands
    Commands -.Command.-> Runner
    Runner -.Execute.-> Shell
    Shell -.Output.-> Runner
    Runner -.Stream.-> IPC
    IPC -.Stream.-> Terminal
    Runner -.Save.-> DB
    HistorySidebar -.Query.-> DB

    style App fill:#4a9eff,stroke:#2d5aa0,stroke-width:2px,color:#fff
    style Commands fill:#ce9178,stroke:#8b6f47,stroke-width:2px,color:#fff
    style AI fill:#ce9178,stroke:#8b6f47,stroke-width:2px,color:#fff
    style Runner fill:#ce9178,stroke:#8b6f47,stroke-width:2px,color:#fff
    style DB fill:#89d185,stroke:#4a7c59,stroke-width:2px,color:#fff
    style OpenAI fill:#ff6b6b,stroke:#c92a2a,stroke-width:2px,color:#fff
    style Gemini fill:#ff6b6b,stroke:#c92a2a,stroke-width:2px,color:#fff
    style Groq fill:#ff6b6b,stroke:#c92a2a,stroke-width:2px,color:#fff
    style IPC fill:#d4a574,stroke:#8b6914,stroke-width:2px,color:#fff
```

## Component Interaction Flow

```mermaid
sequenceDiagram
    participant User
    participant Terminal
    participant IPC as Tauri IPC
    participant Commands
    participant AI
    participant Runner
    participant DB as Database
    participant Shell

    User->>Terminal: Enter NL command
    Terminal->>IPC: nl_to_cmd(text, cwd)
    IPC->>Commands: nl_to_cmd()
    Commands->>Redaction: validate_command()
    Redaction-->>Commands: Validation OK
    Commands->>AI: nl_to_cmd()
    AI->>AI: Build context + prompt
    AI->>OpenAI/Gemini/Groq: API Request
    OpenAI/Gemini/Groq-->>AI: Command Response
    AI-->>Commands: AiCommandResponse
    Commands-->>IPC: Command(s)
    IPC-->>Terminal: Display command(s)
    
    User->>Terminal: Execute command
    Terminal->>IPC: run_command(cmd, cwd)
    IPC->>Commands: run_command()
    Commands->>Redaction: validate_command()
    Redaction-->>Commands: Security check
    Commands->>Runner: run_command_emit()
    Runner->>Shell: Execute process
    Shell-->>Runner: Stream output
    Runner->>IPC: Emit stdout/stderr events
    IPC->>Terminal: Real-time output
    Runner->>DB: Save command history
    Shell-->>Runner: Exit code
    Runner->>IPC: Command complete
    IPC->>Terminal: Final status
```

## Data Flow Architecture

```mermaid
flowchart LR
    subgraph "Input Sources"
        NL[Natural Language Input]
        Direct[Direct Command Input]
        History[History Selection]
        Workflow[Workflow Definition]
    end

    subgraph "Processing Pipeline"
        Validation[Command Validation<br/>Security Checks]
        NLProcessing[NL Processing<br/>AI Translation]
        ContextEnrichment[Context Enrichment<br/>Project Detection]
    end

    subgraph "Execution Layer"
        Execution[Command Execution<br/>Process Management]
        Streaming[Output Streaming<br/>Real-time Updates]
    end

    subgraph "Storage & Retrieval"
        Persistence[Database Persistence<br/>History & Workflows]
        Retrieval[History Retrieval<br/>Session Management]
    end

    NL --> NLProcessing
    Direct --> Validation
    History --> Execution
    Workflow --> Execution
    
    NLProcessing --> ContextEnrichment
    ContextEnrichment --> Validation
    Validation --> Execution
    Execution --> Streaming
    Streaming --> Persistence
    Persistence --> Retrieval
    Retrieval --> History
```

## Technology Stack

### Frontend
- **React** - UI Framework
- **Vite** - Build Tool
- **CSS Modules** - Styling

### Backend
- **Rust** - Core Language
- **Tauri** - Desktop Framework
- **Tokio** - Async Runtime
- **SQLite (rusqlite)** - Database
- **Reqwest** - HTTP Client

### External Services
- **OpenAI API** - GPT Models
- **Google Gemini API** - Gemini Models
- **Groq API** - Fast Inference

### System Integration
- **OS Shell** - PowerShell (Windows), Bash (Linux), Zsh (macOS)
- **File System** - Project file scanning
