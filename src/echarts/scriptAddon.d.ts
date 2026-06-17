import type { ECharts } from 'echarts';
import type { Widget, IChangedTiddlers } from 'tiddlywiki';

export interface IScriptAddon<
  StateType = any,
  AttributesType = Record<string, string>,
> {
  /**
   * Funcion llamada cuando el componente se inicializa por primera vez.(Opcional)
   * @param {ECharts} myChart echartsPara ejemplos, verechartsdeAPIDocumentacion
   * @param {AttributesType} addonAttributes <$echarts> Todos los parametros pasados por el control sonobject
   * @param {Widget} [echartsWidget] <$echarts> Instancia de control, que podra serundefiend
   * @return {StateType} Estado del componente inicializado, utilizado para la gestion del estado.(Opcional)
   */
  onMount?: (
    myChart: ECharts,
    addonAttributes: AttributesType,
    echartsWidget?: Widget | undefined,
  ) => StateType;
  /**
   * Determine si es necesario actualizar la configuracion.(Opcional)
   * @param {StateType} state El estado del componente esonMountEl que regresa
   * @param {IChangedTiddlers} changedTiddlers La actualizacion se realiza medianteTWEsto se activa cuando el sistema detecta cambios en las entradas. Se trata de una matriz de cadenas que contiene los titulos de todas las entradas modificadas.
   * @param {Record<string, true>} changedAttributes ¿Que parametros se cambiaron, incluidos$Parametros al principio.
   * @param {AttributesType} addonAttributes <$echarts> Todos los parametros pasados por el control.
   * @return {boolean} Regresar si es necesario actualizartrue，Viceversa
   *
   * shouldRefresh Tambien puede ser una cadena, entonces es igual a echarts-refresh-trigger Los campos son los mismos
   */
  shouldUpdate?: (
    state: StateType,
    changedTiddlers: IChangedTiddlers,
    changedAttributes: Record<keyof AttributesType, true>,
    addonAttributes: AttributesType,
  ) => boolean;
  /**
   * Funcion llamada cuando se actualiza el componente.
   * @param {ECharts} myChart echartsPara ejemplos, verechartsdeAPIDocumentacion
   * @param {StateType} state El estado del componente esonMountEl que regresa
   * @param {AttributesType} addonAttributes <$echarts> Todos los parametros pasados por el control.
   */
  onUpdate: (
    myChart: ECharts,
    state: StateType,
    addonAttributes: AttributesType,
  ) => void;
  /**
   * Funcion llamada cuando se descarga el componente.(Opcional)
   * Nota: Si la pagina del navegador se cierra directamente, es posible que no se pueda llamar a esta funcion.
   * @param {StateType} state El estado del componente esonMountEl que regresa
   */
  onUnmount?: (state: StateType) => void;
}
