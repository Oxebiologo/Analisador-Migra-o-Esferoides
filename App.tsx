import React, { useState } from 'react';
import Toolbar from './Toolbar';

// Define o tipo para os identificadores de painel para segurança de tipo
type PanelId = 'sticker' | 'project' | 'analysis' | 'adjustments' | 'options' | 'shortcuts';

const App: React.FC = () => {
  // O componente pai (App) gerencia o estado
  const [projectName, setProjectName] = useState('Analisador de Migração');
  const [activePanel, setActivePanel] = useState<PanelId | null>('project'); // Começa com o painel de projeto aberto

  // Funções de callback para passar para o toolbar
  const handleProjectNameChange = (newName: string) => {
    setProjectName(newName);
    console.log(`Nome do projeto alterado para: ${newName}`);
  };

  const handleButtonClick = (panelId: PanelId) => {
    // Lógica para alternar (toggle) a visibilidade do painel
    // Se o painel clicado já estiver ativo, fecha-o (define como null)
    // Caso contrário, abre o painel clicado
    setActivePanel(prevPanel => (prevPanel === panelId ? null : panelId));
    console.log(`Ação para o painel: ${panelId}`);
  };

  const handleSave = () => {
    console.log('Ação de Salvar disparada!');
  };

  const handleReset = () => {
    console.log('Ação de Resetar disparada!');
  };
  
  // Componente de placeholder para os painéis
  const Panel: React.FC<{ title: string }> = ({ title }) => (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mt-4 shadow-lg animate-fade-in">
        <h2 className="text-xl font-bold text-teal-400">{title}</h2>
        <p className="mt-2 text-gray-400">Conteúdo do painel iria aqui.</p>
    </div>
  );


  return (
    <div className="bg-slate-950 text-gray-300 min-h-screen">
      <style>{`
        .animate-fade-in { 
          animation: fadeIn 0.3s ease-in-out; 
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      
      <Toolbar
        projectName={projectName}
        onProjectNameChange={handleProjectNameChange}
        activePanel={activePanel}
        onButtonClick={handleButtonClick}
        onSave={handleSave}
        onReset={handleReset}
      />
      
      <main className="p-4">
        {/* Renderiza o painel correspondente com base no estado 'activePanel' */}
        {activePanel === 'project' && <Panel title="Painel de Projeto & Arquivos" />}
        {activePanel === 'analysis' && <Panel title="Painel de Fluxo de Análise" />}
        {activePanel === 'adjustments' && <Panel title="Painel de Ajustes de Imagem" />}
        {activePanel === 'options' && <Panel title="Painel de Opções" />}
        {activePanel === 'shortcuts' && <Panel title="Painel de Atalhos" />}
        
        {!activePanel && (
            <div className="text-center mt-16 text-gray-500">
                <h1 className="text-2xl font-bold">Nenhum painel aberto</h1>
                <p>Clique em um ícone no toolbar para começar.</p>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
