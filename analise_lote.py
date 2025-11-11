# analise_lote.py

import os
import pandas as pd
from cell_counter import CellCounter

def analisar_pasta_completa(pasta_imagens, pasta_resultados, model_path=None):
    """
    Analisa todas as imagens .tif em uma pasta
    """
    # Criar pasta de resultados se não existir
    os.makedirs(pasta_resultados, exist_ok=True)

    resultados = []

    # Listar arquivos .tif
    arquivos = [f for f in os.listdir(pasta_imagens)
               if f.lower().endswith(('.tif', '.tiff'))]

    print(f"Encontrados {len(arquivos)} arquivos para análise...")

    for i, arquivo in enumerate(arquivos):
        print(f"\nProcessando {i+1}/{len(arquivos)}: {arquivo}")

        caminho_imagem = os.path.join(pasta_imagens, arquivo)

        try:
            # Analisar imagem
            counter = CellCounter(model_path)

            if counter.load_and_preprocess(caminho_imagem):
                if model_path:
                    counter.predict()
                else:
                    # Processamento tradicional
                    from skimage import filters
                    import numpy as np

                    if len(counter.original_image.shape) == 2:
                        thresh = filters.threshold_otsu(counter.original_image)
                        counter.binary_mask = counter.original_image > thresh
                    else:
                        gray_image = np.mean(counter.original_image, axis=2)
                        thresh = filters.threshold_otsu(gray_image)
                        counter.binary_mask = gray_image > thresh

                # Contar células
                cell_count = counter.count_and_analyze(threshold=0.5, min_size=30)

                # Salvar resultados
                resultado_arquivo = {
                    'arquivo': arquivo,
                    'contagem_celulas': cell_count,
                    'area_media': np.mean(counter.properties['areas']) if counter.properties['areas'] else 0,
                    'area_total': np.sum(counter.properties['areas']) if counter.properties['areas'] else 0,
                    'numero_celulas': len(counter.properties['areas']) if counter.properties['areas'] else 0
                }

                resultados.append(resultado_arquivo)

                # Salvar imagem de resultado
                caminho_resultado = os.path.join(pasta_resultados, f"resultado_{arquivo[:-4]}.png")
                counter.visualize_results(save_path=caminho_resultado)

                print(f"✓ {arquivo}: {cell_count} células detectadas")

        except Exception as e:
            print(f"✗ Erro em {arquivo}: {e}")
            resultados.append({
                'arquivo': arquivo,
                'contagem_celulas': 0,
                'area_media': 0,
                'area_total': 0,
                'numero_celulas': 0,
                'erro': str(e)
            })

    # Salvar tabela de resultados
    df = pd.DataFrame(resultados)
    caminho_csv = os.path.join(pasta_resultados, "resultados_contagem.csv")
    df.to_csv(caminho_csv, index=False, encoding='utf-8')

    print(f"\nAnálise concluída! Resultados salvos em: {caminho_csv}")

    return df

# Exemplo de uso
# resultados = analisar_pasta_completa(
#     pasta_imagens="imagens",
#     pasta_resultados="resultados"
# )
