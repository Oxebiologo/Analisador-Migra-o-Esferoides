import React from 'react';

// Define a "API" do componente através de uma interface de props
type PanelId = 'sticker' | 'project' | 'analysis' | 'adjustments' | 'options' | 'shortcuts';

interface ToolbarProps {
  projectName: string;
  onProjectNameChange: (newName: string) => void;
  activePanel: PanelId | null; // Prop para saber qual botão destacar
  onButtonClick: (panelId: PanelId) => void;
  onSave: () => void;
  onReset: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  projectName,
  onProjectNameChange,
  activePanel,
  onButtonClick,
  onSave,
  onReset,
}) => {
  return (
    <header className="w-full flex-shrink-0 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 flex items-center justify-between p-2 pr-4 z-40">
      {/* Seção Esquerda: Ícone e Título Editável */}
      <div className="flex items-center gap-3">
        <div className="bg-teal-500/10 p-2 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-400">
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
            <path d="M22 12A10 10 0 0 0 12 2v10z" />
          </svg>
        </div>
        <input
          type="text"
          className="bg-transparent text-lg font-bold text-white p-1 rounded-md focus:bg-gray-700 focus:ring-1 focus:ring-teal-400 outline-none transition-colors w-96"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
        />
      </div>

      {/* Seção Central: Botões de Ícone */}
      <div className="flex items-center gap-2">
        <button onClick={() => onButtonClick('sticker')} title="Adicionar Sticker" className={`popup-button p-3 rounded-lg hover:bg-gray-700 transition-colors ${activePanel === 'sticker' ? 'active' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </button>
        <button onClick={() => onButtonClick('project')} title="Projeto e Arquivos" className={`popup-button p-3 rounded-lg hover:bg-gray-700 transition-colors ${activePanel === 'project' ? 'active' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
        </button>
        <button onClick={() => onButtonClick('analysis')} title="Fluxo de Análise" className={`popup-button p-3 rounded-lg hover:bg-gray-700 transition-colors ${activePanel === 'analysis' ? 'active' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
        </button>
        <button onClick={() => onButtonClick('adjustments')} title="Ajustes de Imagem" className={`popup-button p-3 rounded-lg hover:bg-gray-700 transition-colors ${activePanel === 'adjustments' ? 'active' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg>
        </button>
        <button onClick={() => onButtonClick('options')} title="Opções e Configurações" className={`popup-button p-3 rounded-lg hover:bg-gray-700 transition-colors ${activePanel === 'options' ? 'active' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.438 1.001s.145.761.438 1.001l1.003.827c.424.35.534.954.26 1.431l-1.296 2.247a1.125 1.125 0 01-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.075.124a6.57 6.57 0 01-.22.127c-.331.183-.581.495-.645.87l-.213 1.281c-.09.543-.56.941-1.11.941h-2.593c-.55 0-1.02-.398-1.11-.941l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 01-.22-.127c-.324-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.437-1.001s-.145-.761-.437-1.001l-1.004-.827a1.125 1.125 0 01-.26-1.431l1.296-2.247a1.125 1.125 0 011.37.49l1.217.456c.355.133.75.072 1.075.124.072-.044.146-.087.22-.127.332-.183.582-.495.645-.87L9.594 3.94zM15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
        <button onClick={() => onButtonClick('shortcuts')} title="Atalhos do Teclado" className={`popup-button p-3 rounded-lg hover:bg-gray-700 transition-colors ${activePanel === 'shortcuts' ? 'active' : ''}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.5 1.591L5.25 12l4 1.591A2.25 2.25 0 019.75 15.185v5.714a2.25 2.25 0 01-1.5 2.085l-1.25.467a2.25 2.25 0 01-2.349-1.846l-.25-1.5a2.25 2.25 0 01.9-2.348l1.25-.467a2.25 2.25 0 001.5-2.085v-5.714a2.25 2.25 0 00-1.5-2.085l-1.25-.467a2.25 2.25 0 01-.9-2.348l.25-1.5a2.25 2.25 0 012.349-1.846l1.25.467A2.25 2.25 0 019.75 3.104zm4.5 0v5.714a2.25 2.25 0 00.5 1.591l4 1.591l-4 1.591a2.25 2.25 0 00-.5 1.591v5.714a2.25 2.25 0 001.5 2.085l1.25.467a2.25 2.25 0 002.349-1.846l.25-1.5a2.25 2.25 0 00-.9-2.348l-1.25-.467a2.25 2.25 0 01-1.5-2.085v-5.714a2.25 2.25 0 011.5-2.085l1.25-.467a2.25 2.25 0 00.9-2.348l-.25-1.5a2.25 2.25 0 00-2.349-1.846l-1.25.467a2.25 2.25 0 00-1.5 2.085z" /></svg>
        </button>
      </div>

      {/* Seção Direita: Ações Principais */}
      <div className="flex items-center gap-2">
        <button onClick={onSave} title="Salvar Análise" className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm">Salvar Análise</button>
        <button onClick={onReset} title="Resetar Tudo" className="bg-rose-600/80 hover:bg-rose-600 disabled:opacity-50 text-white font-bold p-2 rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
            <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
          </svg>
        </button>
      </div>
    </header>
  );
};

export default Toolbar;
