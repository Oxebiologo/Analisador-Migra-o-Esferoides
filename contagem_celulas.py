# contagem_celulas.py

from cell_counter import CellCounter
import matplotlib.pyplot as plt

# 1. Carregar e visualizar uma imagem
image_path = "imagens/amostra1.tif"

# 2. Usar a classe CellCounter
counter = CellCounter()  # Sem modelo - usa processamento tradicional

# 3. Carregar e pré-processar a imagem
if counter.load_and_preprocess(image_path):
    # 4. Para uso sem modelo,criar uma máscara básica
    from skimage import filters
    import numpy as np

    # Criar máscara usando limiarização de Otsu
    if len(counter.original_image.shape) == 2:
        thresh = filters.threshold_otsu(counter.original_image)
        counter.binary_mask = counter.original_image > thresh
    else:
        # Se for colorida, converter para escala de cinza
        gray_image = np.mean(counter.original_image, axis=2)
        thresh = filters.threshold_otsu(gray_image)
        counter.binary_mask = gray_image > thresh

    # 5. Contar células
    cell_count = counter.count_and_analyze(threshold=0.5, min_size=30)

    # 6. Visualizar resultados
    counter.visualize_results()

    # 7. Gerar relatório
    counter.generate_report()
else:
    print("Erro ao carregar a imagem!")
