class CellCounter:
    def __init__(self, model_path=None):
        if model_path:
            self.model = keras.models.load_model(model_path)
        else:
            self.model = None

    def load_and_preprocess(self, image_path):
        """Carrega e pré-processa a imagem"""
        self.original_image = full_preprocessing_pipeline(image_path)
        if self.original_image is None:
            return False

        # Preparar para o modelo
        if len(self.original_image.shape) == 2:
            # Adicionar dimensões de canal e batch
            self.model_input = self.original_image[np.newaxis, :, :, np.newaxis]
        else:
            self.model_input = self.original_image[np.newaxis, :, :, :]

        return True

    def predict(self):
        """Faz a predição do modelo"""
        if self.model is None:
            print("Modelo não carregado!")
            return False

        self.raw_prediction = self.model.predict(self.model_input, verbose=0)
        self.prediction = self.raw_prediction[0, :, :, 0]  # Remover dimensões batch e channel
        return True

    def count_and_analyze(self, threshold=0.5, min_size=30):
        """Conta e analisa as células"""
        # Pós-processamento
        self.binary_mask = postprocess_prediction(self.prediction, min_size, threshold)

        # Contagem
        self.cell_count, self.labels, self.markers = count_cells(self.binary_mask)

        # Análise de propriedades
        self.properties = analyze_cell_properties(self.binary_mask, self.labels)

        return self.cell_count

    def visualize_results(self, save_path=None):
        """Visualiza os resultados"""
        fig, axes = plt.subplots(2, 3, figsize=(15, 10))

        # Imagem original
        axes[0, 0].imshow(self.original_image, cmap='gray')
        axes[0, 0].set_title('Imagem Original')
        axes[0, 0].axis('off')

        # Predição do modelo
        axes[0, 1].imshow(self.prediction, cmap='hot')
        axes[0, 1].set_title('Mapa de Predição')
        axes[0, 1].axis('off')

        # Máscara binária
        axes[0, 2].imshow(self.binary_mask, cmap='gray')
        axes[0, 2].set_title('Máscara Binária')
        axes[0, 2].axis('off')

        # Células detectadas
        axes[1, 0].imshow(self.original_image, cmap='gray')
        axes[1, 0].imshow(self.labels, cmap='jet', alpha=0.5)
        axes[1, 0].set_title(f'Células Detectadas: {self.cell_count}')
        axes[1, 0].axis('off')

        # Marcadores (centros)
        axes[1, 1].imshow(self.original_image, cmap='gray')
        axes[1, 1].imshow(self.markers, cmap='autumn', alpha=0.7)
        axes[1, 1].set_title('Centros das Células')
        axes[1, 1].axis('off')

        # Histograma de áreas
        axes[1, 2].hist(self.properties['areas'], bins=20, alpha=0.7, color='skyblue')
        axes[1, 2].set_title('Distribuição de Áreas')
        axes[1, 2].set_xlabel('Área (pixels)')
        axes[1, 2].set_ylabel('Frequência')

        plt.tight_layout()

        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')

        plt.show()

    def generate_report(self):
        """Gera relatório detalhado"""
        print("=" * 50)
        print("RELATÓRIO DE ANÁLISE DE CÉLULAS")
        print("=" * 50)
        print(f"Total de células detectadas: {self.cell_count}")
        print(f"Área média: {np.mean(self.properties['areas']):.2f} pixels")
        print(f"Desvio padrão da área: {np.std(self.properties['areas']):.2f} pixels")
        print(f"Área mínima: {np.min(self.properties['areas'])} pixels")
        print(f"Área máxima: {np.max(self.properties['areas'])} pixels")
        print("=" * 50)

# Exemplo de uso completo
def analyze_cell_image(image_path, model_path=None, threshold=0.5):
    """
    Função principal para análise de imagem de células
    """
    # Inicializar contador
    counter = CellCounter(model_path)

    # Carregar imagem
    if not counter.load_and_preprocess(image_path):
        print("Erro ao carregar imagem!")
        return None

    # Fazer predição (se modelo disponível)
    if model_path:
        counter.predict()
    else:
        # Usar método tradicional se não há modelo
        print("Usando detecção tradicional (sem modelo treinado)")
        # Implementar detecção tradicional aqui se necessário

    # Contar células
    cell_count = counter.count_and_analyze(threshold=threshold)

    # Visualizar resultados
    counter.visualize_results()

    # Gerar relatório
    counter.generate_report()

    return counter
